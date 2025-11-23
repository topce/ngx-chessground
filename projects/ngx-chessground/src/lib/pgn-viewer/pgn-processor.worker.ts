/// <reference lib="webworker" />

import { Chess } from 'chess.js';

// Define types for messages
export type WorkerMessage =
    | { type: 'load'; payload: string; id: number }
    | { type: 'filter'; payload: FilterCriteria; id: number };

export interface FilterCriteria {
    white: string;
    black: string;
    result: string;
    moves: boolean;
    ignoreColor: boolean;
    targetMoves: string[];
}

export type WorkerResponse =
    | { type: 'load'; payload: { count: number; metadata: GameMetadata[]; games: string[] }; id: number }
    | { type: 'filter'; payload: number[]; id: number }
    | { type: 'error'; payload: string; id: number };

export interface GameMetadata {
    number: number;
    white: string;
    black: string;
    result: string;
}

// State
let games: string[] = [];
let gameMetadata: GameMetadata[] = [];
let gameMovesCache = new Map<number, string[]>();

addEventListener('message', ({ data }: { data: WorkerMessage }) => {
    try {
        switch (data.type) {
            case 'load':
                handleLoad(data.payload, data.id);
                break;
            case 'filter':
                handleFilter(data.payload, data.id);
                break;
        }
    } catch (e) {
        postMessage({ type: 'error', payload: String(e), id: data.id });
    }
});

function handleLoad(pgn: string, id: number) {
    // Reset state
    games = [];
    gameMetadata = [];
    gameMovesCache.clear();

    // Split PGN
    games = splitPgn(pgn);

    // Extract metadata
    gameMetadata = games.map((game, index) => extractGameInfo(game, index));

    postMessage({
        type: 'load',
        id,
        payload: {
            count: games.length,
            metadata: gameMetadata,
            games: games
        }
    });
}

function handleFilter(criteria: FilterCriteria, id: number) {
    const { white, black, result, moves, ignoreColor, targetMoves } = criteria;
    const fWhiteLower = white.toLowerCase();
    const fBlackLower = black.toLowerCase();
    const fResultLower = result.toLowerCase();

    const matches: number[] = [];

    for (let i = 0; i < games.length; i++) {
        const info = gameMetadata[i];
        const whiteName = info.white.toLowerCase();
        const blackName = info.black.toLowerCase();

        let matchWhite = true;
        let matchBlack = true;

        if (ignoreColor) {
            if (fWhiteLower && !(whiteName.includes(fWhiteLower) || blackName.includes(fWhiteLower))) matchWhite = false;
            if (fBlackLower && !(whiteName.includes(fBlackLower) || blackName.includes(fBlackLower))) matchBlack = false;
        } else {
            if (fWhiteLower && !whiteName.includes(fWhiteLower)) matchWhite = false;
            if (fBlackLower && !blackName.includes(fBlackLower)) matchBlack = false;
        }

        if (!matchWhite || !matchBlack) continue;
        if (fResultLower && !info.result.toLowerCase().includes(fResultLower)) continue;

        // Move filtering
        if (moves && targetMoves.length > 0) {
            const pgn = games[i];

            // 1. Fast String Pre-check
            // If the first move isn't even in the string, skip immediately.
            // We check for "1. e4" or "1.e4" or just "e4" depending on format,
            // but checking the raw move string is a good heuristic.
            if (!pgn.includes(targetMoves[0])) {
                continue;
            }

            let gameMoves = gameMovesCache.get(i);
            if (!gameMoves) {
                // 2. Lightweight Parse
                gameMoves = extractMovesFast(pgn);
                gameMovesCache.set(i, gameMoves);
            }

            if (!gameMoves) continue; // Should not happen, but satisfies linter

            let moveMatch = true;
            if (targetMoves.length > gameMoves.length) {
                moveMatch = false;
            } else {
                for (let j = 0; j < targetMoves.length; j++) {
                    if (gameMoves[j] !== targetMoves[j]) {
                        moveMatch = false;
                        break;
                    }
                }
            }
            if (!moveMatch) continue;
        }

        matches.push(i);
    }

    postMessage({
        type: 'filter',
        id,
        payload: matches
    });
}

// --- Helpers ---

function splitPgn(pgn: string): string[] {
    const parts = pgn.split(/(?=(?:^|\r?\n)\[Event\s+")/m);
    const result: string[] = [];
    for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 0 && /^\[Event\s+"/.test(trimmed)) {
            result.push(trimmed);
        }
    }
    return result;
}

function extractGameInfo(pgn: string, index: number): GameMetadata {
    const whiteMatch = pgn.match(/\[White\s+"([^"]+)"\]/);
    const blackMatch = pgn.match(/\[Black\s+"([^"]+)"\]/);
    const resultMatch = pgn.match(/\[Result\s+"([^"]+)"\]/);

    const whiteEloMatch = pgn.match(/\[WhiteElo\s+"([^"]+)"\]/);
    const blackEloMatch = pgn.match(/\[BlackElo\s+"([^"]+)"\]/);
    const whiteTitleMatch = pgn.match(/\[WhiteTitle\s+"([^"]+)"\]/);
    const blackTitleMatch = pgn.match(/\[BlackTitle\s+"([^"]+)"\]/);

    let white = whiteMatch ? whiteMatch[1] : 'Unknown';
    let black = blackMatch ? blackMatch[1] : 'Unknown';
    const result = resultMatch ? resultMatch[1] : '*';

    if (whiteTitleMatch) white = `${whiteTitleMatch[1]} ${white}`;
    if (whiteEloMatch) white = `${white} (${whiteEloMatch[1]})`;

    if (blackTitleMatch) black = `${blackTitleMatch[1]} ${black}`;
    if (blackEloMatch) black = `${black} (${blackEloMatch[1]})`;

    let formattedResult = result;
    if (result === '1-0') formattedResult = '1-0';
    else if (result === '0-1') formattedResult = '0-1';
    else if (result === '1/2-1/2') formattedResult = '½-½';

    return {
        number: index + 1,
        white,
        black,
        result: formattedResult
    };
}

function extractMovesFast(pgn: string): string[] {
    // 1. Isolate the move text (after the headers)
    // Headers end with a blank line.
    let moveText = pgn;
    const headerEndIndex = pgn.lastIndexOf(']');
    if (headerEndIndex !== -1) {
        moveText = pgn.substring(headerEndIndex + 1);
    }

    // 2. Remove comments { ... } and ( ... ) and ; ...
    // This is a simple regex approach. Nested comments might fail but are rare in standard PGNs for display.
    moveText = moveText.replace(/\{[^}]*\}/g, ' '); // Remove {} comments
    moveText = moveText.replace(/\([^)]*\)/g, ' '); // Remove () variations
    moveText = moveText.replace(/;.*$/gm, ' ');     // Remove ; comments

    // 3. Remove move numbers (1. or 1...) and result (1-0, 0-1, 1/2-1/2, *)
    moveText = moveText.replace(/\d+\.+/g, ' ');
    moveText = moveText.replace(/(1-0|0-1|1\/2-1\/2|\*)/g, ' ');

    // 4. Split by whitespace and filter empty
    return moveText.trim().split(/\s+/).filter(m => m.length > 0 && m !== '.');
}
