(function() {
    'use strict';

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
        <style>
            #scryfall-stats-dashboard {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                z-index: 9999;
                background-color: #1a202c;
                color: #e2e8f0;
                border: 1px solid #4a5568;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
            }
            #scryfall-stats-dashboard::backdrop {
                background: rgba(0, 0, 0, 0.5);
            }
            #scryfall-stats-dashboard strong {
                color: #fff;
                font-weight: 600;
            }
            #scryfall-stats-dashboard button {
                width: 100%;
                padding: 8px;
                margin-top: 16px;
                background-color: #2d3748;
                border: 1px solid #4a5568;
                color: #e2e8f0;
                border-radius: 4px;
                cursor: pointer;
            }
            #scryfall-stats-dashboard button:hover {
                background-color: #4a5568;
            }
            #scryfall-stats-dashboard em {
                font-style: italic;
                color: #a0aec0;
            }
        </style>
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

        cards.forEach(card => {
            /* Color Identity */
            const identity = card.color_identity.sort().join('') || 'Colorless';
            identityCounts[identity] = (identityCounts[identity] || 0) + 1;

            /* Mana Value (CMC) */
            cmcCounts[card.cmc] = (cmcCounts[card.cmc] || 0) + 1;

            /* Card Type */
            const typeLine = card.card_faces ? card.card_faces[0].type_line : card.type_line;
            const mainTypes = typeLine.split(' — ')[0];
            mainTypes.split(' ').forEach(type => {
               if(type) typeCounts[type] = (typeCounts[type] || 0) + 1;
            });
        });

        const getTop = (counts, limit = 5) => Object.entries(counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit);

        return {
            topIdentities: getTop(identityCounts),
            topCmcs: Object.entries(cmcCounts).sort(([a,],[b,]) => Number(a) - Number(b)),
            topTypes: getTop(typeCounts),
        };
    }

    function renderDashboard(container, stats, totalCards, wasLimited) {
        const renderSection = (title, data, formatter) => {
            if (data.length === 0) return '';
            return `
                <div style="margin-top: 12px;">
                    <strong>${title}</strong>
                    <div style="padding-left: 8px; border-left: 2px solid #4a5568; margin-top: 4px;">
                    ${data.map(([key, count]) => `
                        <div style="font-size: 0.9em;">
                            ${formatter ? formatter(key) : key}:
                            <strong>${count}</strong> (${((count/totalCards)*100).toFixed(1)}%)
                        </div>
                    `).join('')}
                    </div>
                </div>
            `;
        };
        
        const limitMessage = wasLimited ? `<em style="font-size: 0.8em;">Note: Results capped at ${MAX_PAGES_TO_FETCH} pages.</em><br>` : '';

        container.innerHTML += `
            <form method="dialog">
                <strong>Scryfall Search Stats</strong><br>
                <strong>Total Cards Found:</strong> ${totalCards}<br>
                ${limitMessage}
                ${renderSection('Top 5 Color Identities', stats.topIdentities)}
                ${renderSection('Top 5 Card Types', stats.topTypes)}
                ${renderSection('Mana Curve', stats.topCmcs, (cmc) => `CMC ${cmc}`)}
                <button>Close</button>
            </form>
        `;
        container.querySelector('div').remove();

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
})();
