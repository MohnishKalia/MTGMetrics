
function fetchAllCards(apiUrl, progressCallback) {
    let cards = [];
    let nextUrl = apiUrl;
    let count = 0;
    let pageCount = 0;
    let wasLimited = false;
    const MAX_PAGES_TO_FETCH = 10;

    return new Promise(async (resolve, reject) => {
        while (nextUrl) {
            if (pageCount >= MAX_PAGES_TO_FETCH) {
                wasLimited = true;
                break;
            }
            try {
                await new Promise(r => setTimeout(r, 100)); // Be nice to the API
                const response = await fetch(nextUrl);
                if (!response.ok) {
                    const errorData = await response.json();
                    reject(new Error(errorData.details || `Scryfall API error: ${response.status}`));
                    return;
                }
                const page = await response.json();
                cards = cards.concat(page.data);
                count += page.data.length;
                pageCount++;
                if (progressCallback) {
                    progressCallback(`Fetching page ${pageCount}... Found ${count} cards`);
                }
                nextUrl = page.has_more ? page.next_page : null;
            } catch (error) {
                reject(error);
                return;
            }
        }
        resolve({ cards, wasLimited });
    });
}

function processCards(cards) {
    const identityCounts = {};
    const cmcCounts = {};
    const typeCounts = {};
    const creatureTypeCounts = {};
    const keywordCounts = {};
    const rarityCounts = {};

    cards.forEach(card => {
        // Color Identity
        const identity = card.color_identity.sort().join('') || 'C';
        identityCounts[identity] = (identityCounts[identity] || 0) + 1;

        // Mana Value (CMC)
        cmcCounts[card.cmc] = (cmcCounts[card.cmc] || 0) + 1;

        // Card Type
        const typeLine = card.card_faces ? card.card_faces[0].type_line : card.type_line;
        const mainTypes = typeLine.split(' — ')[0];
        mainTypes.split(' ').forEach(type => {
            if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        // Creature Subtypes
        if (typeLine.includes('Creature —')) {
            const subtypes = typeLine.split(' — ')[1];
            if (subtypes) {
                subtypes.split(' ').forEach(subType => {
                    if (subType) creatureTypeCounts[subType] = (creatureTypeCounts[subType] || 0) + 1;
                });
            }
        }
        
        // Rarity
        rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1;

        // Keywords
        if (card.keywords && card.keywords.length > 0) {
            card.keywords.forEach(kw => {
                keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
            });
        }
    });

    return {
        identityCounts,
        cmcCounts,
        typeCounts,
        rarityCounts,
        creatureTypeCounts,
        keywordCounts,
    };
}
