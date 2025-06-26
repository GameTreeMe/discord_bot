require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { connectDB } = require('./database'); // Add this line to import your DB connection

const { token } = require('./config.json');

async function main() {
    // 1) Connect to MongoDB
    await connectDB();

    // 2) Create Discord client
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

    client.once(Events.ClientReady, readyClient => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
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
                await interaction.reply({ content: '❌ This LFG session no longer exists.', ephemeral: true });
                return;
            }
            const userId = interaction.user.id;
            if (session.participants.some(p => p.discordId === userId)) {
                await interaction.reply({ content: 'You have already joined this LFG session!', ephemeral: true });
                return;
            }
            session.participants.push({ discordId: userId, discordUsername: interaction.user.tag });
            await session.save();
            const guild = interaction.guild;
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
            await interaction.reply({ content: '✅ You have joined the LFG session! You now have access to the temporary text and voice channels.', ephemeral: true });
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