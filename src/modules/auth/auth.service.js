import bcrypt from "bcryptjs";
import authRepository from "./auth.repository.js";
import ConflictError from "../../errors/ConflictError.js";
import ValidationError from "../../errors/ValidationError.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.utils.js";

// ======================================================
// Auth Service
// ======================================================
//
// Responsibility
// Handle authentication-related business logic.
//
// This service:
// - Validates registration rules
// - Hashes passwords
// - Creates restaurant owner accounts
// - Authenticates users
// - Creates authentication tokens
//
// It does not handle HTTP requests.
// ======================================================

class AuthService {
  /**
   * Registers a new restaurant and its owner account.
   */
  async register({
    restaurantName,
    slug,
    countryCode,
    firstName,
    lastName,
    email,
    password,
  }) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedSlug =
      slug.trim().toLowerCase();

    const existingRestaurant =
      await this.#findRestaurantBySlug(
        normalizedSlug
      );

    if (existingRestaurant) {
      throw new ConflictError(
        "A restaurant with this slug already exists.",
        "RESTAURANT_SLUG_ALREADY_EXISTS"
      );
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const result =
      await authRepository.createRestaurantWithOwner({
        restaurant: {
          name: restaurantName.trim(),
          slug: normalizedSlug,
          countryCode: countryCode.trim().toUpperCase(),
        },

        user: {
          email: normalizedEmail,
          passwordHash,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role: "OWNER",
        },
      });

    const user = result.user;

    const accessToken =
      createAccessToken({
        userId: user.id,
        restaurantId: user.restaurantId,
        role: user.role,
      });

    const refreshToken =
      createRefreshToken({
        userId: user.id,
      });

    return {
      accessToken,
      refreshToken,

      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },

      restaurant: {
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
      },
    };
  }

  /**
   * Finds a restaurant by slug.
   *
   * This is kept inside the service temporarily because
   * registration needs to prevent duplicate restaurant slugs.
   */
  async #findRestaurantBySlug(slug) {
    return authRepository.findRestaurantBySlug(
      slug
    );
  }

  /**
   * Logs a user in.
   */
  async login({
    email,
    password,
  }) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await authRepository.findUserByEmailAddress(
        normalizedEmail
      );

    if (!user) {
      throw new ValidationError(
        "Invalid email or password.",
        "INVALID_CREDENTIALS"
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.passwordHash
      );

    if (!passwordMatches) {
      throw new ValidationError(
        "Invalid email or password.",
        "INVALID_CREDENTIALS"
      );
    }

    const accessToken =
      createAccessToken({
        userId: user.id,
        restaurantId: user.restaurantId,
        role: user.role,
      });

    const refreshToken =
      createRefreshToken({
        userId: user.id,
      });

    return {
      accessToken,
      refreshToken,

      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },

      restaurant: {
        id: user.restaurant.id,
        name: user.restaurant.name,
        slug: user.restaurant.slug,
      },
    };
  }

  /**
   * Creates new authentication tokens
   * using a refresh token.
   */
  async refresh(refreshToken) {
    let payload;

    try {
      payload =
        verifyRefreshToken(
          refreshToken
        );
    } catch (error) {
      throw new ValidationError(
        "Invalid or expired refresh token.",
        "INVALID_REFRESH_TOKEN"
      );
    }

    const user =
      await authRepository.findUserById(
        payload.userId
      );

    if (!user) {
      throw new ValidationError(
        "User not found.",
        "USER_NOT_FOUND"
      );
    }

    const accessToken =
      createAccessToken({
        userId: user.id,
        restaurantId: user.restaurantId,
        role: user.role,
      });

    const newRefreshToken =
      createRefreshToken({
        userId: user.id,
      });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Retrieves the authenticated user's profile.
   */
  async getMe(userId) {
    const user =
      await authRepository.findUserById(
        userId
      );

    if (!user) {
      throw new ValidationError(
        "User not found.",
        "USER_NOT_FOUND"
      );
    }

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        restaurantId:
          user.restaurantId,
      },

      restaurant: {
        id: user.restaurant.id,
        name: user.restaurant.name,
        slug: user.restaurant.slug,
      },
    };
  }
}

export default new AuthService();