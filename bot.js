const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');

console.log('=== Démarrage du bot ===');
console.log('DISCORD_TOKEN présent:', !!process.env.DISCORD_TOKEN);
console.log('DISCORD_GUILD_ID:', process.env.DISCORD_GUILD_ID);
console.log('PORT:', process.env.PORT || 3000);

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds] 
});

const BADGE_ROLE_MAPPING = {
    'L1': '1410210518534197321',
};

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const app = express();
app.use(express.json());

// Webhook
app.post('/webhook/badge-obtained', async (req, res) => {
    console.log('Webhook reçu:', req.body);
    res.json({ success: true, message: 'Reçu mais bot non connecté' });
});

// Commandes slash
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    console.log('Commande reçue:', interaction.commandName);
    
    if (interaction.commandName === 'link-account') {
        await interaction.reply({
            content: 'Bot fonctionnel ! Code reçu: ' + interaction.options.getString('code'),
            ephemeral: true
        });
    }
});

client.on('error', (error) => {
    console.error('Erreur Discord client:', error);
});

client.once('ready', async () => {
    console.log(`✅ Bot connecté: ${client.user.tag}`);
    console.log(`✅ Serveurs connectés: ${client.guilds.cache.size}`);
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        console.log(`✅ Serveur trouvé: ${guild.name}`);
    } else {
        console.error('❌ Serveur non trouvé avec ID:', GUILD_ID);
    }
    
    // Enregistrer les commandes slash
    const commands = [
        new SlashCommandBuilder()
            .setName('link-account')
            .setDescription('Lier compte Discord')
            .addStringOption(option =>
                option.setName('code')
                    .setDescription('Code de vérification')
                    .setRequired(true))
    ];
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('🔄 Enregistrement des commandes...');
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Commandes slash enregistrées');
    } catch (error) {
        console.error('❌ Erreur enregistrement commandes:', error);
    }
});

// Tentative de connexion avec gestion d'erreur
console.log('🔄 Tentative de connexion Discord...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('❌ Erreur de connexion Discord:', error);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
