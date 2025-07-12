require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { connectDB } = require('./database'); // Add this line to import your DB connection
const { endLFGSession } = require('./commands/utility/sessionManager');

const { token, targetGuildId } = require('./config.json');

async function main() {
    // 1) Connect to MongoDB
    await connectDB();

    // 2) Create Discord client
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] });

    client.commands = new Collection();
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    // --- LFG Voice Channel Cleanup Logic ---
    const { Session } = require('./models/session');
    const cleanupTimers = new Map();

    // Helper to end a session (robust, 1:1 mapping for posts, temp channel deletion)
    // MOVED TO utils/sessionManager.js

    // --- Listen for voiceStateUpdate to auto-cleanup abandoned sessions ---
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.guild.id !== targetGuildId && oldState.guild.id !== targetGuildId) return;
        const lfgCategoryId = '1387583039294406687';
        const leftChannel = oldState.channel;
        const joinedChannel = newState.channel;
        // If user left a channel in the LFG category
        if (leftChannel && leftChannel.parentId === lfgCategoryId) {
            if (leftChannel.members.size === 0) {
                // Find the session for this channel (voiceChannelId)
                const session = await Session.findOne({ voiceChannelId: leftChannel.id, status: { $in: ['open', 'full'] } });
                if (session) {
                    if (cleanupTimers.has(leftChannel.id)) return;
                    const timer = setTimeout(async () => {
                        const refreshed = leftChannel.guild.channels.cache.get(leftChannel.id);
                        if (refreshed && refreshed.members.size === 0) {
                            await endLFGSession(session, leftChannel.guild, client);
                        }
                        cleanupTimers.delete(leftChannel.id);
                    }, 60000);
                    cleanupTimers.set(leftChannel.id, timer);
                }
            }
        }
        // If user joined a channel in the LFG category, cancel timer
        if (joinedChannel && joinedChannel.parentId === lfgCategoryId) {
            if (cleanupTimers.has(joinedChannel.id)) {
                clearTimeout(cleanupTimers.get(joinedChannel.id));
                cleanupTimers.delete(joinedChannel.id);
            }
        }
    });

    // --- On bot startup, clean up abandoned sessions (empty LFG voice channels) ---
    client.once(Events.ClientReady, async (readyClient) => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
        const lfgCategoryId = '1387583039294406687';
        // Fetch all guilds the bot is in
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId);
            const channels = await guild.channels.fetch();
            const lfgVoiceChannels = channels.filter(c => c.parentId === lfgCategoryId && c.type === 2);
            for (const [channelId, channel] of lfgVoiceChannels) {
                if (channel.members.size === 0) {
                    // Find session by voiceChannelId
                    const session = await Session.findOne({ voiceChannelId: channelId, status: { $in: ['open', 'full'] } });
                    if (session) {
                        await endLFGSession(session, guild, client);
                    }
                }
            }
        }
    });

    client.on(Events.InteractionCreate, async interaction => {
        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command && typeof command.autocomplete === 'function') {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    console.error(error);
                }
            }
            return;
        }

        // Handle button interactions for LFG join
        if (interaction.isButton() && interaction.customId.startsWith('join_lfg_')) {
            const sessionId = interaction.customId.replace('join_lfg_', '');
            const { Session } = require('./models/session');
            const session = await Session.findOne({ sessionId });
            if (!session) {
                await interaction.reply({ content: '❌ This LFG session no longer exists.', flags: MessageFlags.Ephemeral });
                return;
            }
            const userId = interaction.user.id;
            if (session.participants.some(p => p.discordId === userId)) {
                await interaction.reply({ content: 'You have already joined this LFG session!', flags: MessageFlags.Ephemeral });
                return;
            }
            session.participants.push({ discordId: userId, discordUsername: interaction.user.tag });
            await session.save();
            const guild = interaction.guild || await client.guilds.fetch(targetGuildId);
            if (!guild) {
                console.error(`Could not find guild with ID ${targetGuildId}.`);
                await interaction.reply({ content: '❌ There was an error joining the session. Could not find the server.', flags: MessageFlags.Ephemeral });
                return;
            }
            for (const channelId of session.lfgChannelIds || []) {
                const channel = guild.channels.cache.get(channelId);
                if (channel) {
                    await channel.permissionOverwrites.edit(userId, {
                        ViewChannel: true,
                        SendMessages: channel.type === 0,
                        ReadMessageHistory: channel.type === 0,
                        Connect: channel.type === 2,
                        Speak: channel.type === 2
                    });
                }
            }
            // If session is now full, delete the LFG post(s)
            if (session.participants.length >= session.maxPlayers) {
                for (const channelId of session.lfgChannelIds || []) {
                    const channel = guild.channels.cache.get(channelId);
                    if (channel && session.lfgMessageIds && session.lfgMessageIds.length) {
                        for (const msgId of session.lfgMessageIds) {
                            try {
                                const msg = await channel.messages.fetch(msgId);
                                if (msg) await msg.delete();
                            } catch (err) {
                                // Ignore errors (message may already be deleted)
                            }
                        }
                    }
                }
            }
            await interaction.reply({ content: `✅ You have joined the LFG session! You now have access to the temporary channels: <#${session.textChannelId}> (text) and <#${session.voiceChannelId}> (voice).`, flags: MessageFlags.Ephemeral });
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ flags: MessageFlags.Ephemeral, content: 'There was an error while executing this command!' });
            } else {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            }
        }
    });

    // 4) Start the bot
    await client.login(token);
}

main().catch(err => {
    console.error('Fatal error starting bot:', err);
    process.exit(1);
});