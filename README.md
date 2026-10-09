# React Native Game Portal

A React Native game portal built with Expo SDK 54 and TypeScript for the Multiplayer Games course.

The current prototype allows users to discover games, choose a play mode, play Tic-Tac-Toe locally, via internet, or against a computer opponent, and manage local matches across sessions.

## Features

### Discover
- Browse available games
- Search for games
- Choose a game mode
- Responsive layout for web and mobile

### Tic-Tac-Toe
- Local and Internet 2-player mode
- Vs Computer mode
- Turn management
- Win and draw detection
- Play Again
- Finished boards are locked

The computer opponent uses a simple strategy:
1. Make a winning move if available
2. Block an immediate player win
3. Otherwise choose an available square

Online Multiplayer is shown as a future mode but is not implemented.

### My Matches
Local 2-player matches are tracked in the portal.

Matches are separated into:
- Active — unfinished games that can be resumed
- Finished — completed games that can be viewed but not modified

Match state includes the board, current turn, result, and match ID.

### Local Persistence
Local matches are saved using AsyncStorage.

After reloading the app or browser:
- Active matches can still be resumed
- Finished matches remain available
- Board state and results are restored
- Match IDs remain stable
- New matches receive new IDs

Vs Computer games are currently independent and are not persisted.

## Tech Stack

- React Native
- Expo SDK 54
- TypeScript
- AsyncStorage

## Project Structure

    components/
        ModeSelection.tsx

    games/
        TicTacToeGame.tsx
        ticTacToe.ts
        ticTacToe.test.cjs

    portal/
        Portal.tsx
        matches.ts
        matchStorage.ts
        useLocalMatches.ts
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

For mobile testing, use Expo Go with a version compatible with Expo SDK 54.

An iOS simulator requires macOS.

## Testing

Run the automated tests:

    npm test

Run the TypeScript check:

    npm run typecheck

Run the Expo web export:

    npx expo export --platform web

The current implementation passes 22 automated tests as well as the TypeScript and Expo web export checks.
To include online Multiplayer testing, run in a second terminal window:

    npm run server

Then you can test on an android device or through a web browser

## Demo Flow

A simple demo of the current portal:

1. Open Discover and search for Tic-Tac-Toe.
2. Choose Local 2 Players.
3. Make a few moves and return to the portal.
4. Open My Matches and find the game under Active.
5. Resume the match and finish the game.
6. Confirm that it moves to Finished.
7. Reload the app and confirm that the match is still saved.
8. Open the finished match and confirm that the board is locked.
9. Return to Discover and demonstrate Vs Computer.

## Current Scope

This prototype focuses on the React Native portal experience and local gameplay.

Currently not implemented:
- Authentication
- Backend integration
- Invitations
- Notifications

These are intentionally outside the scope of the current demo.
