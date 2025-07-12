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
          value: 'Shares the GameTree profile of the specified user. If the user has connected their GameTree account to Discord, it should work with their Discord display name and username too!',
        },
        {
          name: '/connect <username> <id>',
          value: 'Links your Discord account to your GameTree account using your username and email id. Please connect to enable advanced curation and to make it easier for fellow gamers to search for you.',
        },
        {
          name: '/lfg',
          value: 'Finds other users who are looking for a group (LFG) to play games with. Will send personalized invites to online top matches as well as post in relevant channel.',
        },
        {
          name: '/opt <yes|no>',
          value: 'Helps you select whether you opt in or out of receiving personalized LFG invites.',
        },
        {
          name: '/end',
          value: 'Ends the LFG session you are a part of (can only be done by session host). Don\'t fret if you forget, we have automatic cleanup!',
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
