const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
// fetch est disponible nativement dans Node.js 18+

// Configuration et logs de démarrage
console.log('=== Démarrage du bot Discord LorcaJudge ===');
console.log('DISCORD_TOKEN présent:', !!process.env.DISCORD_TOKEN);
console.log('DISCORD_GUILD_ID:', process.env.DISCORD_GUILD_ID);
console.log('PORT:', process.env.PORT || 3000);

// Configuration Discord
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

// Mapping badges vers rôles Discord
const BADGE_ROLE_MAPPING = {
    'L1': '1410210518534197321'
};

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const API_BASE_URL = 'https://lorcanajudge.com/api';

// Configuration Express
const app = express();
app.use(express.json());

// Route de test
app.get('/', (req, res) => {
    res.json({
        status: 'LorcaJudge Discord Bot is running',
        bot_connected: client.isReady(),
        timestamp: new Date().toISOString()
    });
});

// Route de santé
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        bot_status: client.isReady() ? 'connected' : 'disconnected',
        guild_connected: client.guilds.cache.has(GUILD_ID),
        uptime: process.uptime()
    });
});

// Webhook pour recevoir les notifications de badges
app.post('/webhook/badge-obtained', async (req, res) => {
    try {
        const { discord_username, discord_id, badges } = req.body;
        console.log(`[WEBHOOK] Reçu pour utilisateur: ${discord_username} (ID: ${discord_id})`);
        console.log(`[WEBHOOK] Badges à synchroniser: ${JSON.stringify(badges)}`);
        
        if (!client.isReady()) {
            console.log('[WEBHOOK] Bot Discord non connecté');
            return res.status(503).json({ error: 'Bot Discord non connecté' });
        }
        
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.log(`[WEBHOOK] Serveur Discord non trouvé: ${GUILD_ID}`);
            return res.status(404).json({ error: 'Serveur Discord non trouvé' });
        }
        
        let member = null;
        
        // 1. Essayer de trouver par ID Discord (plus fiable)
        if (discord_id && discord_id.trim() !== '') {
            try {
                member = await guild.members.fetch(discord_id);
                console.log(`[WEBHOOK] Membre trouvé par ID: ${member.user.username} (${member.user.id})`);
            } catch (error) {
                console.log(`[WEBHOOK] Membre non trouvé par ID: ${discord_id}`);
            }
        }
        
        // 2. Si pas trouvé par ID, essayer par nom d'utilisateur
        if (!member && discord_username && discord_username.trim() !== '') {
            try {
                // Récupérer tous les membres (nécessite l'intent GuildMembers)
                await guild.members.fetch();
                
                const members = guild.members.cache;
                member = members.find(m => 
                    m.user.username === discord_username ||
                    m.user.displayName === discord_username ||
                    m.user.globalName === discord_username ||
                    m.user.tag === discord_username // Pour compatibilité ancien format
                );
                
                if (member) {
                    console.log(`[WEBHOOK] Membre trouvé par nom: ${member.user.username} (${member.user.id})`);
                }
            } catch (error) {
                console.log(`[WEBHOOK] Erreur lors de la recherche par nom: ${error.message}`);
            }
        }
        
        if (!member) {
            console.log(`[WEBHOOK] Aucun membre trouvé pour: ${discord_username} (ID: ${discord_id})`);
            
            // Debug: afficher les premiers membres du serveur
            const sampleMembers = guild.members.cache.first(3);
            console.log(`[WEBHOOK] Exemples de membres sur le serveur:`);
            sampleMembers.forEach(m => {
                console.log(`  - ${m.user.username} (ID: ${m.user.id}) [Display: ${m.displayName}]`);
            });
            
            return res.status(404).json({ 
                error: 'Membre Discord non trouvé',
                searched_username: discord_username,
                searched_id: discord_id
            });
        }
        
        // Synchroniser les rôles
        let rolesAdded = 0;
        let rolesAlready = 0;
        let rolesMissing = 0;
        
        for (const badge of badges) {
            const roleId = BADGE_ROLE_MAPPING[badge];
            console.log(`[WEBHOOK] Traitement du badge "${badge}" -> Rôle ID: ${roleId}`);
            
            if (!roleId) {
                console.log(`[WEBHOOK] Aucun rôle mappé pour le badge: ${badge}`);
                rolesMissing++;
                continue;
            }
            
            const role = guild.roles.cache.get(roleId);
            if (!role) {
                console.log(`[WEBHOOK] Rôle avec ID ${roleId} non trouvé sur le serveur`);
                rolesMissing++;
                continue;
            }
            
            if (member.roles.cache.has(roleId)) {
                console.log(`[WEBHOOK] Rôle "${role.name}" déjà présent pour ${member.user.username}`);
                rolesAlready++;
            } else {
                try {
                    await member.roles.add(role);
                    console.log(`[WEBHOOK] ✅ Rôle "${role.name}" ajouté à ${member.user.username}`);
                    rolesAdded++;
                } catch (error) {
                    console.log(`[WEBHOOK] Erreur lors de l'ajout du rôle "${role.name}": ${error.message}`);
                    rolesMissing++;
                }
            }
        }
        
        const summary = {
            success: true,
            member: {
                username: member.user.username,
                id: member.user.id,
                displayName: member.displayName
            },
            roles: {
                added: rolesAdded,
                already_present: rolesAlready,
                missing_or_failed: rolesMissing,
                total_badges: badges.length
            }
        };
        
        console.log(`[WEBHOOK] Résumé de synchronisation:`, summary);
        res.json(summary);
        
    } catch (error) {
        console.error('[WEBHOOK] Erreur critique:', error);
        res.status(500).json({ error: error.message });
    }
});

// Gestion des commandes slash
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    console.log(`[COMMAND] ${interaction.user.username} a utilisé /${interaction.commandName}`);
    
    if (interaction.commandName === 'link-account') {
        const code = interaction.options.getString('code');
        
        try {
            // Appeler l'API pour vérifier le code
            const response = await fetch(`${API_BASE_URL}/discord_integration.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'verify_discord_with_code',
                    verification_code: code,
                    discord_id: interaction.user.id,
                    discord_username: interaction.user.username
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                await interaction.reply({
                    content: '🎉 Compte lié avec succès ! Vos rôles Discord seront automatiquement synchronisés avec vos badges.',
                    flags: 64 // Ephemeral flag
                });
                console.log(`[COMMAND] Liaison réussie pour ${interaction.user.username}`);
            } else {
                await interaction.reply({
                    content: '❌ Code de vérification invalide ou expiré. Vérifiez le code sur votre profil.',
                    flags: 64
                });
                console.log(`[COMMAND] Échec de liaison pour ${interaction.user.username}: ${result.error}`);
            }
        } catch (error) {
            console.error(`[COMMAND] Erreur lors de la vérification:`, error);
            await interaction.reply({
                content: '⚠️ Une erreur technique est survenue. Veuillez réessayer plus tard.',
                flags: 64
            });
        }
    }
});

// Gestion des erreurs Discord
client.on('error', (error) => {
    console.error('[DISCORD] Erreur client:', error);
});

client.on('warn', (warning) => {
    console.warn('[DISCORD] Avertissement:', warning);
});

// Connexion et initialisation
client.once('ready', async () => {
    console.log(`[DISCORD] ✅ Bot connecté: ${client.user.tag}`);
    console.log(`[DISCORD] Serveurs connectés: ${client.guilds.cache.size}`);
    
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
        console.log(`[DISCORD] ✅ Serveur trouvé: "${guild.name}" (${guild.memberCount} membres)`);
        
        // Mettre en cache les membres pour la recherche
        try {
            await guild.members.fetch();
            console.log(`[DISCORD] Membres mis en cache: ${guild.members.cache.size}`);
        } catch (error) {
            console.log(`[DISCORD] Impossible de mettre en cache les membres: ${error.message}`);
        }
    } else {
        console.error(`[DISCORD] ❌ Serveur non trouvé avec l'ID: ${GUILD_ID}`);
    }
    
    // Enregistrer les commandes slash
    const commands = [
        new SlashCommandBuilder()
            .setName('link-account')
            .setDescription('Lier votre compte Discord au site LorcaJudge')
            .addStringOption(option =>
                option.setName('code')
                    .setDescription('Code de vérification obtenu sur le site')
                    .setRequired(true)
                    .setMaxLength(10))
    ];
    
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('[DISCORD] 🔄 Enregistrement des commandes slash...');
        
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, GUILD_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        
        console.log('[DISCORD] ✅ Commandes slash enregistrées avec succès');
    } catch (error) {
        console.error('[DISCORD] ❌ Erreur lors de l\'enregistrement des commandes:', error);
    }
});

// Connexion du bot Discord
console.log('[DISCORD] 🔄 Tentative de connexion...');
client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('[DISCORD] ❌ Erreur de connexion:', error);
    process.exit(1);
});

// Démarrage du serveur Express
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[EXPRESS] Serveur démarré sur le port ${PORT}`);
    console.log(`[EXPRESS] Santé du bot: GET /health`);
    console.log(`[EXPRESS] Webhook: POST /webhook/badge-obtained`);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('[SYSTEM] Arrêt du bot...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('[SYSTEM] Arrêt forcé du bot...');
    client.destroy();
    process.exit(0);
});
