# React Native Game Portal

A React Native game portal built with Expo SDK 54 and TypeScript for the Multiplayer Games course.

The app loads the available game catalog from buildplay.fun, embeds those games for online multiplayer, and saves local snapshots that remain viewable offline.

## Features

### Discover
- Browse available games
- Search for games
- Choose a game mode
- Responsive layout for web and mobile

### Games
- Browse and search games available on buildplay.fun
- Play the hosted games in the app using the platform's shared game protocol
- Create or join online matches by match ID
- Tic-Tac-Toe additionally supports local 2-player and computer modes

The computer opponent uses a simple strategy:
1. Make a winning move if available
2. Block an immediate player win
3. Otherwise choose an available square

Online multiplayer creates, joins, and updates matches through the buildplay.fun REST API. Match state is refreshed while a game is open. Share the match ID with other players.

### My Matches
Local and online matches are tracked in the portal.

Matches are separated into:
- Active — unfinished local games can be resumed; online games show their latest snapshot
- Finished — completed games can be viewed but not modified
- Online snapshots cache the hosted game and complete match state, so they remain viewable offline; offline snapshots are read-only

Local Tic-Tac-Toe matches and online snapshots are saved using AsyncStorage.

### Local Persistence
Local matches are saved using AsyncStorage.

After reloading the app or browser:
- Active local Tic-Tac-Toe matches can still be resumed
- Finished matches remain available
- Online match snapshots, including the hosted game view and current game state, remain available offline
- Match IDs remain stable
- New matches receive new IDs

The app creates an anonymous buildplay.fun user the first time online play is used and stores its API credentials on the device so the same player can rejoin matches. Vs Computer games are not persisted.

## Tech Stack

- React Native
- Expo SDK 54
- TypeScript
- AsyncStorage

## Project Structure

    components/
        HostedGameView.native.tsx
        HostedGameView.web.tsx
        ModeSelection.tsx

    games/
        OnlineMatchSnapshot.tsx
        OnlineBuildplayGame.tsx
        TicTacToeGame.tsx
        ticTacToe.ts
        ticTacToe.test.cjs

    portal/
        buildplayApi.ts
        buildplayGameProtocol.ts
        Portal.tsx
        matches.ts
        matchStorage.ts
        useLocalMatches.ts
        buildplayApi.test.cjs
        buildplayGameProtocol.test.cjs
        matches.test.cjs
        matchStorage.test.cjs

    screens/
        DiscoverScreen.tsx
        MyMatchesScreen.tsx

    App.tsx
    index.ts

The portal and match-management logic are kept separate from the Tic-Tac-Toe game rules and UI.

## Run the Project

Install dependencies:

    npm install

Run the web version:

    npm run web

Or start Expo:

    npm start

### Play online

The Discover screen loads the public game catalog from buildplay.fun. Games are rendered from their hosted HTML and send moves through the platform's match API. No local game server or shared Wi-Fi network is required. Optionally override the API origin with `EXPO_PUBLIC_BUILDPLAY_API_URL`; it defaults to `https://buildplay.fun`.

Choose a game, create a match on one device, and share its match ID. Other players select the same game and join with that ID. Players need an internet connection to play. My Matches keeps the hosted game and latest match state as a local snapshot for offline viewing.

For mobile testing, use Expo Go with a version compatible with Expo SDK 54.

An iOS simulator requires macOS.

## Testing

Run the automated tests:

    npm test

Run the TypeScript check:

    npm run typecheck

Run the Expo web export:

    npx expo export --platform web

Online play and game discovery require internet access to buildplay.fun. Automated tests cover the API request protocol and persisted local and online match snapshots.

## Demo Flow

A simple demo of the current portal:

1. Open Discover and browse or search the buildplay.fun game catalog.
2. Choose a game and create an online match.
3. Share its match ID with the number of players supported by that game.
4. Play several moves and return to the portal.
5. Open My Matches and confirm the game's snapshot is saved.
6. Turn off internet access and open the snapshot to verify the game and state remain viewable.
7. Return to Discover and demonstrate a local Tic-Tac-Toe mode.

## Current Scope

This prototype focuses on the React Native portal experience and games hosted by buildplay.fun.

Currently not implemented:
- Invitations
- Notifications

Online users are anonymous device-local accounts; account linking and recovery are not implemented. Offline online-match snapshots are view-only.
