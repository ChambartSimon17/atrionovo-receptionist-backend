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
// - Creates business owner accounts
// - Authenticates users
// - Creates authentication tokens
//
// It does not handle HTTP requests.
// ======================================================

class AuthService {
  /**
   * Registers a new business and its owner account.
   */
  async register({
    businessName,
    slug,
    countryCode,
    businessType,
    firstName,
    lastName,
    email,
    password,
  }) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedSlug =
      slug.trim().toLowerCase();

    const existingBusiness =
      await this.#findBusinessBySlug(
        normalizedSlug
      );

    if (existingBusiness) {
      throw new ConflictError(
        "A business with this slug already exists.",
        "RESTAURANT_SLUG_ALREADY_EXISTS"
      );
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const result =
      await authRepository.createBusinessWithOwner({
        business: {
          name: businessName.trim(),
          slug: normalizedSlug,
          countryCode: countryCode.trim().toUpperCase(),
          businessType,
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
        businessId: user.businessId,
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

      business: {
        id: result.business.id,
        name: result.business.name,
        slug: result.business.slug,
        businessType: result.business.businessType,
      },
    };
  }

  /**
   * Finds a business by slug.
   *
   * This is kept inside the service temporarily because
   * registration needs to prevent duplicate business slugs.
   */
  async #findBusinessBySlug(slug) {
    return authRepository.findBusinessBySlug(
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
        businessId: user.businessId,
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

      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        businessType: user.business.businessType,
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
        businessId: user.businessId,
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
        businessId:
          user.businessId,
      },

      business: {
        id: user.business.id,
        name: user.business.name,
        slug: user.business.slug,
        businessType: user.business.businessType,
      },
    };
  }
}

export default new AuthService();