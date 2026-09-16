import prisma from "../db/prisma.js";
import { Prisma } from "@prisma/client";

const MAX_TRANSACTION_RETRIES = 3;

/**
 * Executes a Prisma transaction using SERIALIZABLE
 * isolation and retries transient serialization failures.
 *
 * SERIALIZABLE prevents concurrent transactions from
 * committing conflicting reservation changes.
 *
 * A serialization failure is retried because it is a
 * transient database conflict rather than a business error.
 */
export async function runTransaction(
  callback
) {
  for (
    let attempt = 1;
    attempt <= MAX_TRANSACTION_RETRIES;
    attempt++
  ) {
    try {
      return await prisma.$transaction(
        callback,
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        }
      );
    } catch (error) {
      const isSerializationFailure =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";

      if (
        !isSerializationFailure ||
        attempt === MAX_TRANSACTION_RETRIES
      ) {
        throw error;
      }
    }
  }
}