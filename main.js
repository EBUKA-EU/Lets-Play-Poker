// Link in ES-module version of Vue from CDN
import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';;

createApp({
    data() {
        return {
            deckId: null,
            hand: [],
            buttonText: " Draw New Hand",
            instructionText: `No cards drawn yet. Click "Draw New Hand" to get started`,
            loading: false,
            error: null,
            drawCount: 0,
            handResult: "",
            gameMode: "basic",
            texasHole: [],
            texasCommunity: [],
            phase: "idle",       // "idle","hand","flop","turn","river","reset"
            texasButtonText: "Deal Hand",
            texasInstruction: "Click 'Deal Hand' to begin",
            texasBestHand: "Waiting for more cards..."
        }
    },
    methods: {
        async drawNewHand() {
            this.loading = true;
            this.error = null;

            try {
                if (this.drawCount === 0) {
                    // First time: shuffle a new deck
                    const shuffleResponse = await fetch("https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1");
                    const deck = await shuffleResponse.json();
                    this.deckId = deck.deck_id;
                }

                if (this.drawCount === 0) {
                    // Initially draw 5 cards from current deckId
                    const apiCardUrl = `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=5`;
                    const drawCardResponse = await fetch(apiCardUrl);
                    const drawCards = await drawCardResponse.json();
                    this.hand = drawCards.cards.map(card => ({ ...card, selected: false }));
                } else {
                    // Replace card based on whether they are selected or not
                    const selectedCount = this.hand.filter(card => card.selected).length;
                    if (selectedCount > 0) {
                        const newApiCardUrl = `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=${selectedCount}`;
                        const newResponse = await fetch(newApiCardUrl);
                        const replacementCards = await newResponse.json();

                        // Replace selected cards
                        let i = 0;
                        this.hand = this.hand.map(card => {
                            if (card.selected) {
                                const replacement = replacementCards.cards[i++];
                                return { ...replacement, selected: false };
                            } else {
                                return card;
                            }
                        });
                    } else { return }
                }


                this.drawCount++;

                this.buttonText = this.drawCount <= 2 ? "Draw Replacement Hand" : "Draw New Hand";
                this.instructionText = this.drawCount <= 2
                    ? "Click on cards to flip and mark for replacement. You can swap twice."
                    : "You've reached the max swaps. Draw a new hand";

                if (this.drawCount > 2) {
                    this.drawCount = 0;
                }
            } catch (error) {
                this.error = "Failed to fetch data from the API.";
            } finally {
                this.loading = false;
            }

            this.handResult = this.evaluateHand()
        },
        toggleCard(index) {
            this.hand[index].selected = !this.hand[index].selected;
        },
        evaluateHand() {
            if (!this.hand || this.hand.length < 5) return "";
            const values = this.hand.map(card => card.value);
            const suits = this.hand.map(card => card.suit);

            const valueMap = {
                "ACE": 14, "KING": 13, "QUEEN": 12, "JACK": 11, "10": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2
            };

            const cardNumericValues = values.map(value => valueMap[value]).sort((a, b) => (a - b));

            const counts = {};
            cardNumericValues.forEach(value => counts[value] = (counts[value] || 0) + 1);
            const countValues = Object.values(counts).sort((a, b) => (b - a));

            const isFlush = suits.every(suit => suit === suits[0]);

            const isStraight = cardNumericValues.every((value, index, array) => index === 0 || value === array[index - 1] + 1);

            const aceLowStraight = JSON.stringify(cardNumericValues) === JSON.stringify([2, 3, 4, 5, 14]);

            if (isStraight && isFlush && cardNumericValues[0] === 14) return "Royal Flush";
            if (isStraight && isFlush) return "Straight Flush";
            if (countValues[0] === 4) return "Four of a Kind";
            if (countValues[0] === 3 && countValues[1] === 2) return "Full House";
            if (isFlush) return "Flush";
            if (isStraight || aceLowStraight) return "Straight";
            if (countValues[0] === 3) return "Three of a Kind";
            if (countValues[0] === 2 && countValues[1] === 2) return "Two Pair";
            if (countValues[0] === 2) return "One Pair";
            return "High Card";
        },
        switchMode(mode) {
            this.gameMode = mode;
            if (mode === "texas") this.resetTexas();
        },

        resetTexas() {
            this.texasHole = [];
            this.texasCommunity = [];
            this.phase = "idle";
            this.texasButtonText = "Deal Hand";
            this.texasInstruction = "Click 'Deal Hand' to begin";
            this.texasBestHand = "Waiting for more cards...";
        },

        async texasAction() {
            this.loading = true;

            try {
                if (!this.deckId) {
                    const res = await fetch("https://deckofcardsapi.com/api/deck/new/shuffle/");
                    const deck = await res.json();
                    this.deckId = deck.deck_id;
                }

                if (this.phase === "idle") {
                    const draw = await fetch(`https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=2`);
                    const data = await draw.json();

                    this.texasHole = data.cards;
                    this.phase = "preflop";
                    this.texasButtonText = "Deal Flop";
                    this.texasInstruction = "Your Hand";
                }

                else if (this.phase === "preflop") {
                    await this.drawCommunity(3);
                    this.phase = "flop";
                    this.texasButtonText = "Deal Turn";
                    this.updateTexasHand();
                }

                else if (this.phase === "flop") {
                    await this.drawCommunity(1);
                    this.phase = "turn";
                    this.texasButtonText = "Deal River";
                    this.updateTexasHand();
                }

                else if (this.phase === "turn") {
                    await this.drawCommunity(1);
                    this.phase = "done";
                    this.texasButtonText = "Reset Game";
                    this.updateTexasHand();
                }

                else if (this.phase === "done") {
                    this.resetTexas();
                }

            } catch (error) {
                this.error = "Texas Hold'em API error";
            } finally {
                this.loading = false;
            }
        },

        async drawCommunity(count) {
            const res = await fetch(`https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=${count}`);
            const data = await res.json();
            this.texasCommunity.push(...data.cards);
        },

        updateTexasHand() {
            const allCards = [...this.texasHole, ...this.texasCommunity];
            if (allCards.length < 5) {
                this.texasBestHand = "Waiting for more cards...";
                return;
            }

            this.hand = allCards.slice(0, 5);
            this.texasBestHand = this.evaluateHand();
        },
    }

}).mount("#app");