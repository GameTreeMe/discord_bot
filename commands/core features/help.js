const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('List all bot commands and what they do'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('GameTree Bot Help')
      .setColor(0x00AE86)
      .setDescription('Here are all the available commands:')
      .addFields(
        {
          name: '/profile <username>',
          value: 'Fetches information about a particular user and shares a summary. Please update your Display Name to your GameTree username to make searching easier for everyone.',
        },
        {
          name: '/connect <username> <id>',
          value: 'Links your Discord account to your GameTree account by verifying your username and GameTree ID.',
        },
        {
          name: '/lfg',
          value: 'Finds other users who are looking for a group (LFG) to play games with. (Not yet implemented in bot.)',
        },
        {
          name: '/help',
          value: 'Displays this help message with a list of all commands and their descriptions.',
        }
      )
      .setFooter({ text: 'For more information, contact the server admin.' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
};
