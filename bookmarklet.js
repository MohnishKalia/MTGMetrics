function bookmarklet() {
    'use strict';

    /* NOTE: bookmarklet code must be self-contained to avoid CSP issues */
    /* NOTE: all comments cannot be double-slash style */

    /*--- CHECK IF DASHBOARD ALREADY EXISTS ---*/
    const existingDashboard = document.getElementById('scryfall-stats-dashboard');
    if (existingDashboard) {
        existingDashboard.remove();
        return;
    }

    /*--- CHECK IF ON A VALID SCRYFALL SEARCH PAGE ---*/
    if (!window.location.hostname.includes('scryfall.com') || !window.location.pathname.includes('/search')) {
        alert('This bookmarklet only works on Scryfall search result pages.');
        return;
    }
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (!query) {
        alert('No Scryfall search query found in the URL.');
        return;
    }
    
    /*--- CONFIGURATION ---*/
    const MAX_PAGES_TO_FETCH = 10; /* Each page has 175 cards */

    /*--- CREATE DASHBOARD UI ---*/
    const dashboard = document.createElement('dialog');
    dashboard.id = 'scryfall-stats-dashboard';
    dashboard.innerHTML = `
        <div>Fetching card data...</div>
    `;
    document.body.appendChild(dashboard);
    dashboard.showModal();


    /*--- HELPER FUNCTIONS ---*/
    async function fetchAllCards(apiUrl) {
        let cards = [];
        let nextUrl = apiUrl;
        let count = 0;
        let pageCount = 0;
        let wasLimited = false;
        const loader = dashboard.querySelector('div');

        while (nextUrl) {
            if (pageCount >= MAX_PAGES_TO_FETCH) {
                wasLimited = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100)); /* Be nice to the API */
            const response = await fetch(nextUrl);
            if (!response.ok) {
               const errorData = await response.json();
               throw new Error(errorData.details || `Scryfall API error: ${response.status}`);
            }
            const page = await response.json();
            cards = cards.concat(page.data);
            count += page.data.length;
            pageCount++;
            if(loader) loader.textContent = `Fetching page ${pageCount}... Found ${count} cards`;
            nextUrl = page.has_more ? page.next_page : null;
        }
        return { cards, wasLimited };
    }

    function processCards(cards) {
        const identityCounts = {};
        const cmcCounts = {};
        const typeCounts = {};
        const rarityCounts = {};
        const creatureTypeCounts = {};
        const keywordCounts = {};

        cards.forEach(card => {
            /* Color Identity */
            const identity = card.color_identity.sort().join('') || 'C';
            identityCounts[identity] = (identityCounts[identity] || 0) + 1;

            /* Mana Value (CMC) */
            cmcCounts[card.cmc] = (cmcCounts[card.cmc] || 0) + 1;

            /* Card Type */
            const typeLine = card.card_faces ? card.card_faces[0].type_line : card.type_line;
            const mainTypes = typeLine.split(' — ')[0];
            mainTypes.split(' ').forEach(type => {
               if(type) typeCounts[type] = (typeCounts[type] || 0) + 1;
            });
            
            /* Creature Subtypes */
            if (typeLine.includes('Creature —')) {
                const subtypes = typeLine.split(' — ')[1];
                if(subtypes) {
                    subtypes.split(' ').forEach(subType => {
                        if(subType) creatureTypeCounts[subType] = (creatureTypeCounts[subType] || 0) + 1;
                    });
                }
            }

            /* Rarity */
            rarityCounts[card.rarity] = (rarityCounts[card.rarity] || 0) + 1;

            /* Keywords */
            if (card.keywords && card.keywords.length > 0) {
                card.keywords.forEach(kw => {
                    keywordCounts[kw] = (keywordCounts[kw] || 0) + 1;
                });
            }
        });

        const getTop = (counts, limit = 5) => Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit);
        
        const rarityOrder = { 'mythic': 1, 'rare': 2, 'uncommon': 3, 'common': 4, 'special': 5, 'bonus': 6 };

        return {
            topIdentities: getTop(identityCounts),
            topCmcs: Object.entries(cmcCounts).sort(([a,],[b,]) => Number(a) - Number(b)),
            topTypes: getTop(typeCounts),
            rarities: Object.entries(rarityCounts).sort(([a,],[b,]) => (rarityOrder[a] || 99) - (rarityOrder[b] || 99)),
            topCreatureTypes: getTop(creatureTypeCounts),
            topKeywords: getTop(keywordCounts)
        };
    }

    function renderDashboard(container, stats, totalCards, wasLimited) {
        const renderSectionAsDetails = (title, data, formatter, isRanked = false) => {
            if (!data || data.length === 0) return '';
            const rankEmojis = ['🥇', '🥈', '🥉', '4.', '5.'];
            let html = `<br><details><summary>▶ <strong>${title}</strong></summary><table>`;
            for (const [i, [key, count]] of data.entries()) {
                const label = formatter ? formatter(key) : key;
                const percentage = ((count / totalCards) * 100).toFixed(1);
                const rank = isRanked && i < rankEmojis.length ? `${rankEmojis[i]} ` : '';
                html += `<tr><td>${rank}${label}:&nbsp;</td><td><strong>${count}</strong>&nbsp;</td><td>(${percentage}%)</td></tr>`;
            }
            html += '</table></details>';
            return html;
        };
        
        const limitMessage = wasLimited ? `<em>Note: Results capped at ${MAX_PAGES_TO_FETCH} pages.</em><br>` : '';

        const initialContent = container.querySelector('div');
        if(initialContent) initialContent.remove();

        container.innerHTML += `
            <form method="dialog">
                <div>
                    <strong>Scryfall Search Stats - Expand Sections</strong><br>
                    <strong>Total Cards Found:</strong> ${totalCards}<br>
                    ${limitMessage}
                    ${renderSectionAsDetails('Color Identities', stats.topIdentities, k => k === 'C' ? 'Colorless' : k, true)}
                    ${renderSectionAsDetails('Card Types', stats.topTypes, k => k, true)}
                    ${renderSectionAsDetails('Rarities', stats.rarities, k => k.charAt(0).toUpperCase() + k.slice(1))}
                    ${renderSectionAsDetails('Creature Types', stats.topCreatureTypes, k => k, true)}
                    ${renderSectionAsDetails('Keywords', stats.topKeywords, k => k, true)}
                    ${renderSectionAsDetails('Mana Curve', stats.topCmcs, (cmc) => `CMC ${cmc}`)}
                    <br><br>
                    <button>Close</button>
                </div>
            </form>
        `;

        /* The dialog element can be closed by its form's button or the ESC key. */
        container.addEventListener('close', () => {
            container.remove();
        });
    }


    /*--- MAIN EXECUTION ---*/
    async function main() {
        try {
            const apiUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`;
            const { cards: allCards, wasLimited } = await fetchAllCards(apiUrl);
            
            if(allCards.length === 0) {
                dashboard.innerHTML = '<div>No cards found. <form method="dialog"><button>Close</button></form></div>';
                return;
            }

            const stats = processCards(allCards);
            renderDashboard(dashboard, stats, allCards.length, wasLimited);
        } catch (error) {
            console.error('Scryfall Stats Bookmarklet Error:', error);
            dashboard.innerHTML = `<div><strong>Error:</strong> ${error.message} <form method="dialog"><button>Close</button></form></div>`;
        }
    }

    main();
}
