import "dotenv/config";

const API_URL = "http://localhost:3000";

const reservationAId =
  "cmu70sh6a0001s0i2y9wtnr40";

const reservationBId =
  "cmu70t6vr0003s0i227in3i9o";

const restaurantId =
  "cmsx40oy30000s01nzviohyxu";

const newStartTime =
  "2026-09-18T17:00:00.000Z";

const updateReservation = async (
  reservationId,
  number
) => {
  const response = await fetch(
    `${API_URL}/reservations/${reservationId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId,

        firstName:
          `Update${number}`,

        lastName:
          "Concurrency",

        phoneNumber:
          `+3247000020${number}`,

        email:
          `update${number}@test.com`,

        guestCount: 4,

        startTime:
          newStartTime,

        notes:
          "Concurrent update test",
      }),
    }
  );

  const body =
    await response.json();

  return {
    request: number,
    status: response.status,
    body,
  };
};

async function main() {
  console.log(
    "Starting concurrent update test..."
  );

  const results =
    await Promise.all([
      updateReservation(
        reservationAId,
        1
      ),

      updateReservation(
        reservationBId,
        2
      ),
    ]);

  console.log(
    JSON.stringify(
      results,
      null,
      2
    )
  );
}

main().catch(console.error);