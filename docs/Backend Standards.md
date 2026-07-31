# AtrioNovo Backend Standards

Version: 1.0

---

# Philosophy

The backend should always be:

- Easy to understand
- Easy to extend
- Easy to debug
- Easy to test

Code is read far more often than it is written.

Optimize for readability over cleverness.

When in doubt:

> Choose the solution that a new developer can understand in five minutes.

---

# Architecture

Every feature is isolated inside its own module.

Example:

src/
└── modules/
└── reservation/
├── reservation.controller.js
├── reservation.service.js
├── reservation.repository.js
├── reservation.routes.js
└── reservation.validator.js

A module owns:

- Routes
- Controller
- Service
- Repository
- Validation

No feature logic should be spread throughout the project.

---

# Responsibilities

## Controller

Responsible for HTTP only.

Allowed:

- Read params
- Read query
- Read body
- Validate request
- Call service
- Return response

Never:

- Query Prisma
- Business rules
- Complex calculations

---

## Service

Contains all business logic.

Examples:

- Reservation rules
- Capacity checks
- Opening hour validation
- Restaurant policies

The service orchestrates repositories.

The service never talks directly to Fastify.

---

## Repository

Responsible only for database access.

Allowed:

- Prisma queries

Never:

- Validation
- Business rules
- Calculations

Repositories should feel like database adapters.

---

# Validation

Every request must be validated.

Use:

- Zod

Validation belongs inside validators.

Never validate inside repositories.

---

# Error Handling

Throw typed errors.

Examples:

- ValidationError
- NotFoundError
- ConflictError

Never return error objects.

Throw them.

The global error middleware handles formatting.

---

# Documentation

Every file starts with a documentation block.

Example:

======================================================
Reservation Service
======================================================

Responsibility

Handles reservation business logic.

Business Rules

- Capacity
- Availability
- Opening hours

======================================================

Public methods receive JSDoc.

Private methods receive short comments explaining WHY.

Never explain obvious code.

Explain intent.

---

# Naming

Classes

ReservationService

Methods

createReservation()

Variables

occupiedSeats

Avoid abbreviations.

Bad

cnt

Good

guestCount

---

# Functions

Small functions.

One responsibility.

If a function needs multiple comments explaining sections:

Split it.

---

# Private Methods

Prefer extracting logic.

Good

validateCapacity()

Bad

400-line methods.

---

# Async

Always use async/await.

Avoid Promise chains.

---

# Transactions

Whenever multiple writes belong together:

Use Prisma transactions.

Example

Delete schedule

Insert schedule

Must happen inside one transaction.

---

# Prisma

Relations stay on one line.

Example

@relation(fields: [restaurantId], references: [id], onDelete: Cascade)

Indexes stay on one line.

Example

@@index([restaurantId], map: "idx_restaurant")

Reason:

Maximum compatibility with Prisma parser.

---

# Comments

Comment WHY.

Not WHAT.

Bad

Increment i

Good

Move to the next opening period.

---

# Folder Structure

Shared code lives outside modules.

Examples

errors/
utils/
db/
config/

Feature code stays inside modules.

---

# Utilities

Pure helper functions belong inside utils.

Example

minutesToTime()

Utilities never depend on business logic.

---

# Testing

Every endpoint receives Bruno requests.

Minimum:

✓ Success

✓ Validation failure

✓ Not found

✓ Edge cases

A feature is not finished until Bruno tests pass.

---

# Git

Commit often.

Each commit should represent one feature.

Good

feat: implement opening hours module

Bad

update

---

# Boy Scout Rule

Whenever touching existing code:

Leave it cleaner than you found it.

Small improvements compound over time.

---

# Readability

Prefer this

if (!restaurant) {
throw new NotFoundError(...);
}

Over clever one-liners.

Readable beats short.

---

# Future Modules

Every future module follows exactly the same architecture.

Examples

CRM

AI

Authentication

Billing

Tables

Arrival Slots

Notifications

Customers

All should look familiar.
