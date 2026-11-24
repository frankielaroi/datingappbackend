# Dating App Backend

This repository contains the backend code for a dating application built with Node.js, Express.js, and MongoDB.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Configuration](#configuration)
- [Usage](#usage)
- [Endpoints](#endpoints)
- [Contributing](#contributing)
- [License](#license)

## Features

- User registration and authentication (using JWT)
- Email and phone number verification
- Password reset functionality
- Matching algorithm based on user preferences
- CRUD operations for managing user profiles
- Error handling and response formatting

## Prerequisites

Before you begin, ensure you have the following installed on your local machine:

- Node.js (v20 or higher)
- npm (Node.js package manager)
- MongoDB 6+ and Redis 6+ (installed and running)

## Getting Started

### Installation

1. Clone this repository:

   bash
   git clone https://github.com/frankielaroi/datingappbackend.git

2. Navigate to the project directory:

   cd datingappbackend

3. Install dependencies:

   npm install

### Configuration

Already configured


## Usage

Requires MongoDB and Redis. Copy the variables listed in `types/env.d.ts` into `.env`.

```bash
npm run dev          # API with reload (tsx + nodemon)
npm run worker       # background match-list worker (run alongside the API)
npm run seed         # 80 local test users (local MongoDB only)
npm run build        # compile to dist/
npm start            # run the compiled API
npm run start:worker # run the compiled worker
npm run reindex      # full Algolia re-index (after bulk imports)
```

The API runs at `http://localhost:4001` by default. `GET /healthz` reports MongoDB and Redis status for load balancers.

## Running more than one instance

The API keeps no state in memory. Sessions, rate-limit counters, Socket.IO rooms and match lists all live in Redis, so any number of API instances can run behind a load balancer. Set `TRUST_PROXY` to the number of proxies in front of the app so rate limits see real client IPs. Run one or more workers; Bull spreads jobs across them.

## Matching

- Candidates come from a `$geoNear` query that applies gender, age, relationship goal, activity (last 30 days) and past swipes inside the geo index scan, then the nearest 500 are scored.
- Each user's ranked list (up to 200) is stored in Redis and served from there. Entries are re-checked against both profiles before being shown.
- Lists are rebuilt when they expire (24h), run low, or when someone within 200 km changes their profile. The worker also rebuilds lists for everyone active in the last week each night.

## Migrations

Take a backup first (`mongodump`). Each migration is safe to run more than once and supports `--dry-run`.

```bash
npm run migrate:001 -- --dry-run
npm run migrate:001
```

`001` merges `googleusers` into `users` (linking Google to an existing account with the same email), moves likes, comments, shares, chats and conversation message arrays into their own collections, and replaces the old indexes. It renames `googleusers` to a backup collection rather than dropping it. Non-local databases need `--allow-remote`.

## Endpoints

- `POST /api/register`, `POST /api/auth/login`
- `GET /api/verify-email?token=`, `POST /api/verify-phone`, `POST /api/verify-otp`
- `POST /forgot-password`, `POST /reset-password/:resetToken`
- `GET /auth/google`, `GET /auth/google/callback`, `GET /logout`
- `GET /api/users?limit=&after=`, `GET /api/users/:id`, `PUT /api/users/:id`, `DELETE /api/users/:id` (edit and delete: own account only)
- `POST /api/match/` - your matches (`matchScore` 0-100, `distanceKm`, `outsidePreferences`)
- `POST /api/swipes` `{ targetId, action: "like" | "pass" }`, `GET /api/swipes/matches`
- `GET /api/search?query=`
- `POST /api/conversations`, `GET /api/conversations`, `GET /api/messages?conversationId=&before=`
- `GET|POST /api/posts`, `GET|PUT|DELETE /api/posts/:postId`, `GET /api/posts/:postId/comments`
- `POST /api/likes`, `DELETE /api/likes/:postId`, `POST /api/comments`, `POST /api/shares`

Socket.IO events: `joinRoom { conversationId }`, `chatMessage { conversationId, text }`, `messageRead`, `typing`, `stopTyping`.

## Contributing

Contributions are welcome! Please fork this repository and create a pull request with your proposed changes.

## License

This project is licensed under the MIT License.
