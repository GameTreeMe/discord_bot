const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Game } = require('../../models/games');
const { Session } = require('../../models/session');
const { targetGuildId } = require('../../config.json');

module.exports = {
  guildOnly: true,
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
          { name: 'PC', value: 'pc' },
          { name: 'PlayStation', value: 'playstation' },
          { name: 'Nintendo', value: 'nintendo' },
          { name: 'Mobile', value: 'mobile' },
          { name: 'Xbox', value: 'xbox' },
          { name: 'Web3', value: 'web3' },
          { name: 'Tabletop', value: 'tabletop' },
          { name: 'Other', value: 'other' }
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
    if (interaction.guildId && interaction.guildId !== targetGuildId) {
      await interaction.reply({
        content: 'This command can only be used in the LFG Bot testing server.',
        ephemeral: true
      });
      return;
    }

    if (!interaction.guild) {
      await interaction.reply({
        content: 'The `/lfg` command must be used within the LFG Bot testing server, not in DMs.',
        ephemeral: true
      });
      return;
    }
    const gameInput = interaction.options.getString('game', true);
    const platform = interaction.options.getString('platform', true);
    const description = interaction.options.getString('description') || 'No description provided.';
    const players = interaction.options.getInteger('players') || 2;
    const host = interaction.user;

    // Check if user is connected (exists in DB by discordUsername)
    const { User } = require('../../models/user');
    const dbUser = await User.findOne({ discordUsername: host.username }).lean();
    if (!dbUser) {
      await interaction.reply({
        content: 'You are currently using basic lfg. To use advanced lfg with GameTree curation, please use /connect to sync your GameTree profile.',
        ephemeral: true
      });
      // Continue with basic LFG functionality (do not return)
    } else {
      await interaction.deferReply({ ephemeral: true });
    }

    // Check if user has any active gaming sessions
    const activeSession = await Session.findOne({ creatorDiscordId: host.id, status: { $in: ['open', 'full'] } });
    if (activeSession) {
      if (!dbUser) {
        await interaction.followUp({
          content: '❌ You already have an ongoing gaming session. Please end your current session before creating a new one using `/end`.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ You already have an ongoing gaming session. Please end your current session before creating a new one using `/end`.'
        });
      }
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
      'pc': '1387195578865156170',
      'playstation': '1387195738752159764',
      'nintendo': '1387195632724344843',
      'mobile': '1387639202933506048',
      'other': '1387617485716459620',
      'xbox': '1392734591621664868',
      'web3': '1392734683007025192',
      'tabletop': '1392734704674930748'
    };
    
    // Use exact match (case-insensitive) or default to 'other'
    const channelId = platformChannelMap[platform.toLowerCase()] || platformChannelMap['other'];
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
    // Create a unique channel name based on host.username
    const displayName = host.username;
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
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
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
          allow: ['ViewChannel', 'Connect', 'Speak']
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
      
      if (!dbUser) {
        await interaction.followUp({
          content: `Your LFG post has been shared in <#${channelId}>!\nTemporary channels created: <#${tempTextChannel.id}> (text), <#${tempVoiceChannel.id}> (voice).`,
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: `Your LFG post has been shared in <#${channelId}>!\nTemporary channels created: <#${tempTextChannel.id}> (text), <#${tempVoiceChannel.id}> (voice).`,
        });
      }

      // --- Personalized Invites System ---
      // Only send personalized invites if the user is connected
      if (dbUser) {
        const { inviteTopMatches } = require('./invites');
        const onlineUserIds = await getOnlineUsers(interaction.guild);
        // Call the personalized invite system
        await inviteTopMatches(sessionDoc.sessionId, interaction.client, onlineUserIds);
      }
      // --- End Personalized Invites System ---
    } else {
      if (!dbUser) {
        await interaction.followUp({
          content: '❌ Could not find the designated channel for this platform.',
          ephemeral: true
        });
      } else {
        await interaction.editReply({
          content: '❌ Could not find the designated channel for this platform.',
        });
      }
    }
  },

  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'game') {
      const focusedValue = focusedOption.value;
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
  },
};

async function getOnlineUsers(guild) {
  if (!guild) return [];
  // Fetch all members to ensure presence data is up to date
  await guild.members.fetch();
  const onlineUsers = guild.members.cache.filter(member =>
    member.presence &&
    member.presence.status === 'online' &&
    !member.voice.channel &&
    !member.user.bot
  );
  return onlineUsers.map(member => member.user.id);
}
