const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../../models/user'); 
const { Game } = require('../../models/games'); // Import Game model

/**
 * /profile <username>
 * 
 * Fetches a user by `username` (your “username” field in Mongo) and
 * displays: platforms, genres, language(s), age, timezone,
 * personality type, and games (as IDs or names, depending on your schema).
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show GameTree profile for a given Discord username')
    .addStringOption(opt =>
      opt
        .setName('username')
        .setDescription('The GameTree username to look up')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username', true);

    // Try to find by discordDisplayName, then discordUsername, then username
    let dbUser = await User.findOne({ discordDisplayName: username })
      .select([
        'platforms',
        'genres',
        'profile.languages',
        'profile.birthday',
        'profile.timezone',
        'profile.gender',
        'profile.aboutMe',
        'personalityProfile.personality',
        'gameIds'
      ])
      .lean();

    if (!dbUser) {
      dbUser = await User.findOne({ discordUsername: username })
        .select([
          'platforms',
          'genres',
          'profile.languages',
          'profile.birthday',
          'profile.timezone',
          'profile.gender',
          'profile.aboutMe',
          'personalityProfile.personality',
          'gameIds'
        ])
        .lean();
    }

    if (!dbUser) {
      dbUser = await User.findOne({ username })
        .select([
          'platforms',
          'genres',
          'profile.languages',
          'profile.birthday',
          'profile.timezone',
          'profile.gender',
          'profile.aboutMe',
          'personalityProfile.personality',
          'gameIds'
        ])
        .lean();
    }

    if (!dbUser) {
      return interaction.editReply({
        content: `❌ No user found with Discord display name, Discord username, or GameTree username \`${username}\`. Please check the case-sensitive spelling and try again. Alternatively, the user may not have connected their GameTree account yet.`
      });
    }

    // compute age from birthday
    let age = '—';
    if (dbUser.profile?.birthday) {
      const born = new Date(dbUser.profile.birthday);
      const diff = Date.now() - born.getTime();
      age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365)).toString();
    }

    // build the embed
    const aboutMe = dbUser.profile?.aboutMe || 'This user has not written their about me.';
    const gender = dbUser.profile?.gender || 'This user has chosen not to share their gender.';

    // Convert gameIds to game names
    let gameNames = '—';
    if (Array.isArray(dbUser.gameIds) && dbUser.gameIds.length > 0) {
      // Find all games in one query
      const games = await Game.find({ _id: { $in: dbUser.gameIds } }).select(['title']).lean();
      if (games.length > 0) {
        gameNames = games.map(g => g.title || 'Unknown Game').join(', ');
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`GameTree Profile: ${username}`)
      .setColor(0x00AE86)
      .addFields(
        { name: 'Platforms', value: dbUser.platforms.join(', ') || '—', inline: true },
        { name: 'Genres',    value: dbUser.genres.join(', ')    || '—', inline: true },
        { name: 'Language',  value: (dbUser.profile.languages || []).join(', ') || '—', inline: true },
        { name: 'Age',       value: age,                        inline: true },
        { name: 'Timezone',  value: dbUser.profile.timezone || '—', inline: true },
        { name: 'Gender',    value: gender,                     inline: true },
        { name: 'About Me',  value: aboutMe,                    inline: false },
        { name: 'Personality', value: dbUser.personalityProfile?.personality || '—', inline: true },
        { name: 'Want to play',     value: gameNames, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};