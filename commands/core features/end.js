const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { Session } = require('../../models/session');
const { endLFGSession } = require('../../utils/sessionManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('end')
    .setDescription('End your active LFG session and clean up channels/posts.'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const userId = interaction.user.id;
    const guild = interaction.guild;

    // Find the open session by creatorDiscordId
    const session = await Session.findOne({ creatorDiscordId: userId, status: { $in: ['open', 'full'] } });
    if (!session) {
      await interaction.editReply('❌ You do not have any ongoing gaming sessions right now.');
      return;
    }

    // Ask for confirmation with a button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_end_session')
        .setLabel('End Session')
        .setStyle(ButtonStyle.Danger)
    );
    await interaction.editReply({
      content: '⚠️ Are you sure you want to end your LFG session? This will delete the temporary channels and post.',
      components: [row],
      flags: MessageFlags.Ephemeral
    });

    // Wait for button interaction from the user
    try {
      const confirmation = await interaction.channel.awaitMessageComponent({
        filter: i => i.user.id === userId && i.customId === 'confirm_end_session',
        time: 15000,
        componentType: ComponentType.Button
      });
      await confirmation.deferUpdate();
    } catch (err) {
      await interaction.editReply({ content: '❌ Session end cancelled (no confirmation received).', components: [], flags: MessageFlags.Ephemeral });
      return;
    }

    // Use the centralized session manager to end the session
    await endLFGSession(session, guild, interaction.client);

    try {
      await interaction.editReply({ content: '✅ Your LFG session has been ended. A summary has been sent to all participants.', components: [], flags: MessageFlags.Ephemeral });
    } catch (err) {
      if (err.code !== 10008) { // Ignore Unknown Message error
        console.error(err);
      }
    }
  }
};
