const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

    // Check if user is connected (exists in DB by discordUsername)
    const { User } = require('../../models/user');
    const dbUser = await User.findOne({ discordUsername: host.username }).lean();
    if (!dbUser) {
      await interaction.editReply({
        content: '❌ You must connect your account first using `/connect` before creating an LFG post.'
      });
      return;
    }

    // Check if user has any active gaming sessions
    const activeSession = await Session.findOne({ creatorDiscordId: host.id, status: { $in: ['open', 'full'] } });
    if (activeSession) {
      await interaction.editReply({
        content: '❌ You already have anongoing gaming session. Please end your current session before creating a new one using `/end`.'
      });
      return;
    }

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
      'PlayStation': '1387195738752159764',
      'Xbox': '1387644182054568057',
      'Nintendo Switch': '1387195632724344843',
      'Mobile': '1387639202933506048',
      'Other': '1387617485716459620'
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

    // --- Create temporary text and voice channels under LFG category ---
    const lfgCategoryId = '1387583039294406687';
    const guild = interaction.guild;
    // Create a unique channel name based on discordDisplayName
    const displayName = dbUser.discordDisplayName || host.username;
    const safeDisplayName = displayName.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60);
    const textChannelName = `${safeDisplayName}-text-channel`;
    const voiceChannelName = `${safeDisplayName}-voice-channel`;
    // Create text channel
    const tempTextChannel = await guild.channels.create({
      name: textChannelName,
      type: 0, // 0 = GUILD_TEXT
      parent: lfgCategoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: ['ViewChannel']
        },
        {
          id: host.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }
      ]
    });
    // Create voice channel
    const tempVoiceChannel = await guild.channels.create({
      name: voiceChannelName,
      type: 2, // 2 = GUILD_VOICE
      parent: lfgCategoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: ['ViewChannel']
        },
        {
          id: host.id,
          allow: ['ViewChannel', 'Connect', 'Speak']
        }
      ]
    });
    // Invite host to both channels (send a message with links)
    await tempTextChannel.send({
      content: `<@${host.id}> This is your temporary LFG text channel! Join the voice channel here: <#${tempVoiceChannel.id}>`
    });

    // Update sessionDoc with correct channel IDs
    sessionDoc.textChannelId = tempTextChannel.id;
    sessionDoc.voiceChannelId = tempVoiceChannel.id;
    // lfgChannelIds should only include the main LFG post channel
    sessionDoc.lfgChannelIds = [channelId];
    await sessionDoc.save();

    // Now create the embed and join button (after channels are created)
    const embed = new EmbedBuilder()
      .setTitle('🎮 Looking For Group!')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Game', value: gameInput, inline: true },
        { name: 'Platform', value: platform, inline: true },
        { name: 'Players Needed', value: players.toString(), inline: true },
        { name: 'Host', value: `<@${host.id}>`, inline: true },
        { name: 'Description', value: description, inline: false },
        { name: 'Voice Channel', value: `<#${tempVoiceChannel.id}>`, inline: false },
        { name: 'Text Channel', value: `<#${tempTextChannel.id}>`, inline: false }
      )
      .setFooter({ text: `LFG posted by ${host.tag}` })
      .setTimestamp();

    const joinRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`join_lfg_${sessionDoc.sessionId}`)
        .setLabel('Join LFG')
        .setStyle(ButtonStyle.Success)
    );

    if (channel) {
      const sentMsg = await channel.send({
        content: '🚀 New LFG post!',
        embeds: [embed],
        allowedMentions: { users: [] },
        components: [joinRow]
      });
      // Save message ID to session
      sessionDoc.lfgMessageIds = [sentMsg.id];
      await sessionDoc.save();
      await interaction.editReply({
        content: `Your LFG post has been shared in <#${channelId}>!\nTemporary channels created: <#${tempTextChannel.id}> (text), <#${tempVoiceChannel.id}> (voice).`,
      });

      // --- Personalized Invites System ---
      // You must provide a list of online Discord user IDs who are not in a call.
      // This should be fetched from your Discord server logic or presence tracking system.
      // For demonstration, we'll assume you have a function getOnlineUserIdsNotInCall(guild) that returns this list.
      const { inviteTopMatches } = require('./invites');
      let onlineUserIds = [];
      if (typeof getOnlineUserIdsNotInCall === 'function') {
        onlineUserIds = await getOnlineUserIdsNotInCall(guild);
      } else {
        // TODO: Replace this with your actual logic to get online users not in a call
        onlineUserIds = guild.members.cache
          .filter(m => m.presence && m.presence.status === 'online' && !m.voice.channel)
          .map(m => m.user.id);
      }
      // Call the personalized invite system
      await inviteTopMatches(sessionDoc.sessionId, interaction.client, onlineUserIds);
      // --- End Personalized Invites System ---
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
  },
};
