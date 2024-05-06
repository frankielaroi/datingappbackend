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

- Node.js (v14.x or higher)
- npm (Node.js package manager)
- MongoDB (installed and running)

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

Start the server:

npm start

The server will be running at `http://localhost:4001` by default.

## Endpoints

The backend exposes the following endpoints:

- `POST /api/register` - User registration
- `GET /api/verify-email?token=<verification_token>` - Email verification
- `POST /api/verify-phone` - Phone number verification and OTP generation
- `POST /api/verify-otp` - OTP verification for phone number
- `POST /api/auth/login` - User authentication
- `POST /forgot-password` - Initiate password reset process (send reset email)
- `POST /reset-password?resetToken=<reset_token>` - Reset user password
- `POST /api/match/:id` - Matchmaking based on user preferences
- `GET /api/users` - Fetch all users
- `GET /api/users/:id` - Fetch a single user
- `PUT /api/users?id=<user_id>` - Update a user profile
- `DELETE /api/users?id=<user_id>` - Delete a user
-  `GET /api/search?query=<search_query>` - Search users by name or username


## Contributing

Contributions are welcome! Please fork this repository and create a pull request with your proposed changes.

## License

This project is licensed under the MIT License.
