const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Game } = require('../../models/games');
const { Session } = require('../../models/session');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Create a Looking For Group (LFG) post')
    .addStringOption(opt =>
      opt.setName('game')
        .setDescription('Name of the game')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('platform')
        .setDescription('Platform (e.g. PC, PS5, Xbox, etc)')
        .setRequired(true)
        .addChoices(
          { name: 'PC', value: 'PC' },
          { name: 'PlayStation', value: 'PlayStation' },
          { name: 'Xbox', value: 'Xbox' },
          { name: 'Nintendo Switch', value: 'Nintendo Switch' },
          { name: 'Mobile', value: 'Mobile' },
          { name: 'Other', value: 'Other' }
        )
    )
    .addStringOption(opt =>
      opt.setName('description')
        .setDescription('Optional description (max 250 chars)')
        .setMaxLength(250)
        .setRequired(false)
    )
    .addIntegerOption(opt =>
      opt.setName('players')
        .setDescription('Number of players wanted (default 2)')
        .setMinValue(2)
        .setMaxValue(99)
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const gameInput = interaction.options.getString('game', true);
    const platform = interaction.options.getString('platform', true);
    const description = interaction.options.getString('description') || 'No description provided.';
    const players = interaction.options.getInteger('players') || 2;
    const host = interaction.user;

    // Find all games by title or alternative_names (case-insensitive)
    let dbGames = await Game.find({
      $or: [
        { title: new RegExp(`^${gameInput}$`, 'i') },
        { alternative_names: { $elemMatch: { $regex: `^${gameInput}$`, $options: 'i' } } }
      ]
    }).select(['_id', 'title', 'alternative_names']);

    let gameIdText;
    let gameIdForSession = null;
    if (dbGames.length === 1) {
      gameIdText = dbGames[0]._id.toString();
      gameIdForSession = dbGames[0]._id.toString();
    } else if (dbGames.length > 1) {
      gameIdText = dbGames.map(g => `${g._id.toString()} (${g.title}${g.alternative_names && g.alternative_names.length ? ', aka: ' + g.alternative_names.join(', ') : ''})`).join('\n');
      gameIdText = `Multiple matches found:\n${gameIdText}`;
      // If multiple, store the first match for session (or null if you want to force manual selection)
      gameIdForSession = dbGames[0]._id.toString();
    } else {
      gameIdText = 'Not found in database';
      gameIdForSession = null;
    }

    // Map platform to channel ID
    const platformChannelMap = {
      'PC': '1387195578865156170',
      'Nintendo Switch': '1387195632724344843',
      'Xbox': '1387195710876811441',
      'PlayStation': '1387195738752159764',
      'Mobile': '1387195842196406424',
      'Other': '1387196020361789561'
    };
    const channelId = platformChannelMap[platform] || platformChannelMap['Other'];
    const channel = interaction.guild.channels.cache.get(channelId);

    // Create session in DB (let Mongo assign _id)
    const sessionDoc = new Session({
      creatorDiscordId: host.id,
      creatorUsername: host.tag,
      creatorGTUserId: undefined, // You can fill this if you have GT linkage
      gameId: gameIdForSession || 'not_found',
      gameName: gameInput,
      platform,
      description,
      maxPlayers: players,
      participants: [{ discordId: host.id, discordUsername: host.tag }],
      textChannelId: channelId,
      lfgChannelIds: [channelId],
      lfgMessageIds: [], // Will be filled after sending the message
      status: 'open',
      sessionId: undefined // Will set after save
    });
    await sessionDoc.save();
    // Set sessionId to the Mongo _id string and save again
    sessionDoc.sessionId = sessionDoc._id.toString();
    await sessionDoc.save();

    const embed = new EmbedBuilder()
      .setTitle('🎮 Looking For Group!')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Game', value: gameInput, inline: true },
        { name: 'Platform', value: platform, inline: true },
        { name: 'Players Needed', value: players.toString(), inline: true },
        { name: 'Host', value: `<@${host.id}>`, inline: true },
        { name: 'Description', value: description, inline: false },
        { name: 'Game _id(s)', value: gameIdText, inline: false },
        { name: 'Session ID', value: sessionDoc.sessionId, inline: false }
      )
      .setFooter({ text: `LFG posted by ${host.tag}` })
      .setTimestamp();

    if (channel) {
      const sentMsg = await channel.send({
        content: '🚀 New LFG post!',
        embeds: [embed],
        allowedMentions: { users: [] }
      });
      // Save message ID to session
      sessionDoc.lfgMessageIds.push(sentMsg.id);
      await sessionDoc.save();
      await interaction.editReply({
        content: `Your LFG post has been shared in <#${channelId}>!`,
      });
    } else {
      await interaction.editReply({
        content: '❌ Could not find the designated channel for this platform.',
      });
    }
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    // Search for up to 10 games matching the input (title or alternative_names)
    const results = await Game.find({
      $or: [
        { title: { $regex: focusedValue, $options: 'i' } },
        { alternative_names: { $elemMatch: { $regex: focusedValue, $options: 'i' } } }
      ]
    })
    .select(['title', 'alternative_names'])
    .limit(10);

    // Format for Discord autocomplete (name, value)
    const choices = results.map(g => ({
      name: g.title,
      value: g.title
    }));

    await interaction.respond(choices);
  }
};
