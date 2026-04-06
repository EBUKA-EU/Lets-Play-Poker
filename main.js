/**
 * main.js — Let's Play Poker
 *
 * Vue 3 application (loaded via ESM CDN) implementing:
 *   - 5-Card Draw Poker with card replacement
 *   - Texas Hold'em with staged community card reveal
 *   - Poker hand evaluation for both modes
 *
 * External API: https://deckofcardsapi.com/
 */
import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

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
      // Texas Hold'em phase tracker: idle → preflop → flop → turn → done
      phase: "idle",
      texasButtonText: "Deal Hand",
      texasInstruction: "Click 'Deal Hand' to begin",
      texasBestHand: "Waiting for more cards...",
    };
  },
  methods: {
    /**
     * Handles drawing a new hand or replacing selected cards.
     *
     * On the first draw (drawCount === 0), a new shuffled deck is retrieved
     * from the API and five cards are drawn. On subsequent draws, only the
     * cards the player has selected are replaced. Players may swap up to
     * two times before the deck is reset.
     */
    async drawNewHand() {
      this.loading = true;
      this.error = null;

      try {
        if (this.drawCount === 0) {
          // Fetch a fresh shuffled deck and store its ID for reuse
          const shuffleResponse = await fetch(
            "https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1",
          );
          const deck = await shuffleResponse.json();
          this.deckId = deck.deck_id;
        }

        if (this.drawCount === 0) {
          // Draw the initial 5-card hand
          const apiCardUrl = `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=5`;
          const drawCardResponse = await fetch(apiCardUrl);
          const drawCards = await drawCardResponse.json();
          this.hand = drawCards.cards.map((card) => ({
            ...card,
            selected: false,
          }));
        } else {
          // Replace only the cards the player has selected
          const selectedCount = this.hand.filter(
            (card) => card.selected,
          ).length;
          if (selectedCount > 0) {
            const newApiCardUrl = `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=${selectedCount}`;
            const newResponse = await fetch(newApiCardUrl);
            const replacementCards = await newResponse.json();

            let i = 0;
            this.hand = this.hand.map((card) => {
              if (card.selected) {
                const replacement = replacementCards.cards[i++];
                return { ...replacement, selected: false };
              } else {
                return card;
              }
            });
          } else {
            return;
          }
        }

        this.drawCount++;

        this.buttonText =
          this.drawCount <= 2 ? "Draw Replacement Hand" : "Draw New Hand";
        this.instructionText =
          this.drawCount <= 2
            ? "Click on cards to flip and mark for replacement. You can swap twice."
            : "You've reached the max swaps. Draw a new hand";

        // Reset swap counter after the maximum of two swaps
        if (this.drawCount > 2) {
          this.drawCount = 0;
        }
      } catch (error) {
        this.error = "Failed to fetch data from the API.";
      } finally {
        this.loading = false;
      }

      const result = this.evaluateFiveCardHand(this.hand);
      this.handResult = result.name;
    },
    /**
     * Toggles the selected state of a card at the given index.
     * Selected cards are shown face-down and queued for replacement.
     *
     * @param {number} index - Index of the card in the hand array.
     */
    toggleCard(index) {
      this.hand[index].selected = !this.hand[index].selected;
    },
    /**
     * Evaluates a 5-card poker hand and returns its name and rank.
     *
     * Checks all standard hand rankings from High Card up to Royal Flush,
     * including Ace-low straight detection (A-2-3-4-5).
     *
     * @param {Object[]} cards - Array of exactly 5 card objects from the API.
     * @returns {{ name: string, rank: number }} The hand name and its numeric rank.
     */
    evaluateFiveCardHand(cards) {
      if (!cards || cards.length < 5) return "";
      const values = cards.map((card) => card.value);
      const suits = cards.map((card) => card.suit);

      const valueMap = {
        ACE: 14,
        KING: 13,
        QUEEN: 12,
        JACK: 11,
        10: 10,
        9: 9,
        8: 8,
        7: 7,
        6: 6,
        5: 5,
        4: 4,
        3: 3,
        2: 2,
      };

      const cardNumericValues = values
        .map((value) => valueMap[value])
        .sort((a, b) => a - b);

      const counts = {};
      cardNumericValues.forEach(
        (value) => (counts[value] = (counts[value] || 0) + 1),
      );
      const countValues = Object.values(counts).sort((a, b) => b - a);

      const isFlush = suits.every((suit) => suit === suits[0]);

      const isStraight = cardNumericValues.every(
        (value, index, array) => index === 0 || value === array[index - 1] + 1,
      );

      const aceLowStraight =
        JSON.stringify(cardNumericValues) === JSON.stringify([2, 3, 4, 5, 14]);

      const handRankings = {
        "Royal Flush": 10,
        "Straight Flush": 9,
        "Four of a Kind": 8,
        "Full House": 7,
        Flush: 6,
        Straight: 5,
        "Three of a Kind": 4,
        "Two Pair": 3,
        "One Pair": 2,
        "High Card": 1,
      };

      let name = "High Card";

      if (isStraight && isFlush && cardNumericValues[0] === 14)
        name = "Royal Flush";
      else if (isStraight && isFlush) name = "Straight Flush";
      else if (countValues[0] === 4) name = "Four of a Kind";
      else if (countValues[0] === 3 && countValues[1] === 2)
        name = "Full House";
      else if (isFlush) name = "Flush";
      else if (isStraight || aceLowStraight) name = "Straight";
      else if (countValues[0] === 3) name = "Three of a Kind";
      else if (countValues[0] === 2 && countValues[1] === 2) name = "Two Pair";
      else if (countValues[0] === 2) name = "One Pair";
      return { name, rank: handRankings[name] };
    },

    /**
     * Generates all unique 5-card combinations from a given set of cards.
     *
     * Used in Texas Hold'em to find the best possible hand from the combined
     * hole and community cards.
     *
     * @param {Object[]} cards - Array of card objects (typically 5–7 cards).
     * @returns {Object[][]} Array of 5-card combination arrays.
     */
    getFiveCardCombinations(cards) {
      const combos = [];
      const cardsLength = cards.length;

      for (let i = 0; i < cardsLength; i++) {
        for (let j = i + 1; j < cardsLength; j++) {
          for (let k = j + 1; k < cardsLength; k++) {
            for (let l = k + 1; l < cardsLength; l++) {
              for (let m = l + 1; m < cardsLength; m++) {
                combos.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
              }
            }
          }
        }
      }
      return combos;
    },

    /**
     * Switches between 'basic' (5-Card Draw) and 'texas' (Texas Hold'em) modes.
     * Resets the Texas Hold'em state when switching to that mode.
     *
     * @param {string} mode - Either 'basic' or 'texas'.
     */
    switchMode(mode) {
      this.gameMode = mode;
      if (mode === "texas") this.resetTexas();
    },

    /**
     * Resets all Texas Hold'em state to its initial idle condition,
     * clearing hole cards, community cards, and the phase tracker.
     */
    resetTexas() {
      this.texasHole = [];
      this.texasCommunity = [];
      this.phase = "idle";
      this.texasButtonText = "Deal Hand";
      this.texasInstruction = "Click 'Deal Hand' to begin";
      this.texasBestHand = "Waiting for more cards...";
    },

    /**
     * Advances the Texas Hold'em game through its phases in sequence:
     * idle → preflop (deal hole cards) → flop → turn → done (river).
     *
     * Reuses the shared deck ID if one exists, otherwise fetches a new
     * shuffled deck. Calls updateTexasHand() after each community card reveal.
     */
    async texasAction() {
      this.loading = true;

      try {
        if (!this.deckId) {
          const res = await fetch(
            "https://deckofcardsapi.com/api/deck/new/shuffle/",
          );
          const deck = await res.json();
          this.deckId = deck.deck_id;
        }

        if (this.phase === "idle") {
          const draw = await fetch(
            `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=2`,
          );
          const data = await draw.json();

          this.texasHole = data.cards;
          this.phase = "preflop";
          this.texasButtonText = "Deal Flop";
          this.texasInstruction = "Your Hand";
        } else if (this.phase === "preflop") {
          await this.drawCommunity(3);
          this.phase = "flop";
          this.texasButtonText = "Deal Turn";
          this.updateTexasHand();
        } else if (this.phase === "flop") {
          await this.drawCommunity(1);
          this.phase = "turn";
          this.texasButtonText = "Deal River";
          this.updateTexasHand();
        } else if (this.phase === "turn") {
          await this.drawCommunity(1);
          this.phase = "done";
          this.texasButtonText = "Reset Game";
          this.updateTexasHand();
        } else if (this.phase === "done") {
          this.resetTexas();
        }
      } catch (error) {
        this.error = "Texas Hold'em API error";
      } finally {
        this.loading = false;
      }
    },

    /**
     * Draws a specified number of community cards from the current deck
     * and appends them to the community cards array.
     *
     * @param {number} count - Number of community cards to draw.
     */
    async drawCommunity(count) {
      const res = await fetch(
        `https://deckofcardsapi.com/api/deck/${this.deckId}/draw/?count=${count}`,
      );
      const data = await res.json();
      this.texasCommunity.push(...data.cards);
    },

    /**
     * Calculates the best possible 5-card poker hand from the player's
     * hole cards combined with all revealed community cards.
     *
     * Evaluates every 5-card combination and stores the highest-ranked result.
     */
    updateTexasHand() {
      const allCards = [...this.texasHole, ...this.texasCommunity];
      if (allCards.length < 5) {
        this.texasBestHand = "Waiting for more cards...";
        return;
      }

      const combinations = this.getFiveCardCombinations(allCards);

      let hand = null;
      for (const combination of combinations) {
        const result = this.evaluateFiveCardHand(combination);
        if (!hand || result.rank > hand.rank) {
          hand = result;
        }
      }

      this.texasBestHand = hand.name;
    },
  },
}).mount("#app");
