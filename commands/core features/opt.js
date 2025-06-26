const { SlashCommandBuilder } = require('discord.js');
const { User } = require('../../models/user');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('opt')
    .setDescription('Opt in or out of personalized LFG invites')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('yes to opt in, no to opt out')
        .setRequired(true)
        .addChoices(
          { name: 'yes', value: 'yes' },
          { name: 'no', value: 'no' }
        )
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const status = interaction.options.getString('status');
    const discordUsername = interaction.user.username;
    const optIn = status === 'yes';
    try {
      const user = await User.findOneAndUpdate(
        { discordUsername },
        { lfgInviteOptIn: optIn },
        { new: true }
      );
      if (!user) {
        await interaction.editReply({ content: 'User not found in database. Please link your account first.' });
        return;
      }
      await interaction.editReply({ content: `Your LFG invite preference has been set to: ${optIn ? 'opted in' : 'opted out'}.` });
    } catch (err) {
      console.error(err);
      await interaction.editReply({ content: 'There was an error updating your preference. Please try again later.' });
    }
  }
};