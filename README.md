# React Native Game Portal

A React Native game portal built with Expo SDK 54 and TypeScript for the Multiplayer Games course.

The app loads the available game catalog from buildplay.fun, embeds those games for online multiplayer, and saves local snapshots that remain viewable offline.

## Features

### Discover
- Browse available games
- Search for games
- Download games to this device for offline play
- Choose a game mode
- Responsive layout for web and mobile

### Games
- Browse and search games available on buildplay.fun
- Play the hosted games in the app using the platform's shared game protocol
- Create or join online matches by match ID
- Browse public games waiting for players and join directly
- Download hosted games for offline access
- Tic-Tac-Toe additionally supports local 2-player and computer modes

The Tic-Tac-Toe computer opponent uses a simple strategy:
1. Make a winning move if available
2. Block an immediate player win
3. Otherwise choose an available square

Downloaded non-Tic-Tac-Toe games are saved on the device, but do not yet have an automated computer opponent. A game-specific opponent is required; the app will not guess by clicking arbitrary controls. Downloading saves the game's hosted HTML and metadata on this device.

Online multiplayer creates, joins, and updates matches through the buildplay.fun REST API. Match state is refreshed while a game is open. Share the match ID with other players.

The Join a Game page lists public online matches waiting for players and refreshes automatically. Select a match to join it directly.

### My Matches
Local and online matches are tracked in the portal.

Matches are separated into:
- Active — unfinished local and online games can be resumed
- Finished — completed games can be viewed but not modified
- Online snapshots cache the hosted game and complete match state, so they remain viewable offline; offline snapshots are read-only

Selecting an active online match reconnects to buildplay.fun and resumes the live match with the saved player account. Finished online matches remain read-only snapshots.

Local Tic-Tac-Toe matches and online snapshots are saved using AsyncStorage.

### Local Persistence
Local matches are saved using AsyncStorage.

After reloading the app or browser:
- Active local Tic-Tac-Toe matches can still be resumed
- Finished matches remain available
- Online match snapshots, including the hosted game view and current game state, remain available offline
- Match IDs remain stable
- New matches receive new IDs

The app creates an anonymous buildplay.fun user the first time online play is used and stores its API credentials on the device so the same player can rejoin matches. Local Tic-Tac-Toe matches, including Vs Computer games, preserve their mode and progress.

Downloaded game code is kept on the device, so downloaded games remain listed when the catalog is unavailable. Offline play may still require a connection if a game's HTML loads external assets or services.

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
        OpenGamesScreen.tsx

    App.tsx
    index.ts

The portal and match-management logic are kept separate from the Tic-Tac-Toe game rules and UI.

### BuildPlay Offline

The BuildPlay Offline tab provides a separate offline-first workflow alongside the Discover catalog:
- Download and cache supported BuildPlay games, including their static scripts, styles, and media
- Start private, on-device games that remain saved offline
- Sign in with Google on web to create, join, and synchronize multiplayer matches
- Queue legal moves locally and synchronize them when the network returns; synchronization conflicts preserve local progress for review
- Use the production web build as an installable app shell with service-worker caching for the portal itself

Offline downloads are validated rather than assumed to work for every arbitrary hosted game. Games that require runtime network access, modules, or unsupported external assets may not be offered as offline-ready. Google sign-in and first-time downloads require internet access. Native Google sign-in requires native OAuth configuration and is not included in this web flow.

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

Build an installable web app shell with offline startup support:

    npm run build:web

Test the exported app shell's offline caching:

    npm run test:web-offline

Online play and game discovery require internet access to buildplay.fun. Automated tests cover the API request protocol and persisted local and online match snapshots.

## Demo Flow

A simple demo of the current portal:

1. Open Discover and browse or search the buildplay.fun game catalog.
2. Download a game and confirm it remains available in Discover.
3. Choose Tic-Tac-Toe and play against its game-specific computer opponent.
4. Choose a hosted game and create an online match.
5. Share its match ID with the number of players supported by that game.
6. Play several moves and return to the portal.
7. Open My Matches and confirm the game's snapshot is saved and remains viewable offline.

## Current Scope

This prototype focuses on the React Native portal experience and games hosted by buildplay.fun.

Currently not implemented:
- Invitations
- Notifications

Online users are anonymous device-local accounts; account linking and recovery are not implemented. Offline online-match snapshots are view-only.
