const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { User } = require('../../models/user'); 

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
    await interaction.deferReply();

    const username = interaction.options.getString('username', true);

    // only pull the fields you care about
    const dbUser = await User.findOne({ username })
      .select([
        'platforms',
        'genres',
        'profile.languages',
        'profile.birthday',
        'profile.timezone',
        'personalityProfile.personality',
        'gameIds'
      ])
      .lean();

    if (!dbUser) {
      return interaction.editReply({
        content: `❌ No user found with username \`${username}\`.`
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
    const embed = new EmbedBuilder()
      .setTitle(`GameTree Profile: ${username}`)
      .setColor(0x00AE86)
      .addFields(
        { name: 'Platforms', value: dbUser.platforms.join(', ') || '—', inline: true },
        { name: 'Genres',    value: dbUser.genres.join(', ')    || '—', inline: true },
        { name: 'Language',  value: (dbUser.profile.languages || []).join(', ') || '—', inline: true },
        { name: 'Age',       value: age,                        inline: true },
        { name: 'Timezone',  value: dbUser.profile.timezone || '—', inline: true },
        { name: 'Personality', value: dbUser.personalityProfile?.personality || '—', inline: true },
        // if you have a separate Game model you could resolve IDs to names here instead
        { name: 'Games',     value: (dbUser.gameIds || []).join(', ') || '—', inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};