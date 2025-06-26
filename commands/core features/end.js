const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { Session } = require('../../models/session');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('end')
    .setDescription('End your active LFG session and clean up channels/posts.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
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
      ephemeral: true
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
      await interaction.editReply({ content: '❌ Session end cancelled (no confirmation received).', components: [], ephemeral: true });
      return;
    }

    // Attempt to kick users from the voice channel(s) before deleting
    const channelIds = session.lfgChannelIds || [];
    for (const channelId of channelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (channel && channel.type === 2) { // 2 = GUILD_VOICE
        for (const [memberId, member] of channel.members) {
          try {
            await member.voice.disconnect('LFG session ended');
          } catch (err) {
            // Ignore errors (user may have already left)
          }
        }
      }
    }

    // Attempt to delete temp text and voice channels
    let deletedChannels = [];
    for (const channelId of channelIds) {
      try {
        const channel = guild.channels.cache.get(channelId);
        if (channel) {
          await channel.delete('LFG session ended');
          deletedChannels.push(channelId);
        }
      } catch (err) {
        // Ignore errors (channel may already be deleted)
      }
    }

    // Attempt to delete LFG post messages
    const lfgMessageIds = session.lfgMessageIds || [];
    for (const channelId of channelIds) {
      const channel = guild.channels.cache.get(channelId);
      if (channel && lfgMessageIds.length) {
        for (const msgId of lfgMessageIds) {
          try {
            const msg = await channel.messages.fetch(msgId);
            if (msg) await msg.delete();
          } catch (err) {
            // Ignore errors (message may already be deleted)
          }
        }
      }
    }

    // Mark session as closed
    session.status = 'closed';
    session.callEndedAt = new Date();
    await session.save();

    await interaction.editReply({ content: '✅ Your LFG session has been ended. Temporary channels and posts have been deleted.', components: [], ephemeral: true });
  }
};
