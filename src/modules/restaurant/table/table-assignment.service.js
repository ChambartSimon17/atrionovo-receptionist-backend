import tableRepository from "./table.repository.js";

class TableAssignmentService {
  /**
   * Finds all active tables that are not occupied
   * during the requested reservation period.
   */
  async findAvailableTables(
    restaurantId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    excludeTableId,
    db
  ) {
    const tables =
      await tableRepository.findActiveTablesForRestaurant(
        restaurantId,
        db
      );

    const availableTables = [];

    for (const table of tables) {
      if (table.id === excludeTableId) {
        continue;
      }

      const reservations =
        await tableRepository.findTableReservations(
          table.id,
          startTime,
          endTime,
          ignoreReservationId,
          db
        );

      if (reservations.length === 0) {
        availableTables.push(table);
      }
    }

    return availableTables;
  }

  /**
   * Finds the smallest table combination that can
   * accommodate the requested number of guests.
   */
  findBestTableCombination(
    availableTables,
    guestCount
  ) {
    let bestCombination = null;

    const findCombinations = (
      startIndex,
      currentCombination,
      currentCapacity
    ) => {
      if (currentCapacity >= guestCount) {
        if (
          !bestCombination ||
          currentCombination.length <
            bestCombination.tables.length ||
          (
            currentCombination.length ===
              bestCombination.tables.length &&
            currentCapacity <
              bestCombination.capacity
          )
        ) {
          bestCombination = {
            tables: [...currentCombination],
            capacity: currentCapacity,
          };
        }

        return;
      }

      for (
        let i = startIndex;
        i < availableTables.length;
        i++
      ) {
        if (
          bestCombination &&
          currentCombination.length >=
            bestCombination.tables.length
        ) {
          break;
        }

        const table =
          availableTables[i];

        findCombinations(
          i + 1,
          [
            ...currentCombination,
            table,
          ],
          currentCapacity +
            table.capacity
        );
      }
    };

    findCombinations(
      0,
      [],
      0
    );

    return bestCombination;
  }

  /**
   * Finds the best available table combination
   * for a reservation.
   */
  async assignTables({
    restaurantId,
    guestCount,
    startTime,
    endTime,
    ignoreReservationId,
    excludeTableId,
    db,
  }) {
    const availableTables =
      await this.findAvailableTables(
        restaurantId,
        guestCount,
        startTime,
        endTime,
        ignoreReservationId,
        excludeTableId,
        db
      );

    return this.findBestTableCombination(
      availableTables,
      guestCount
    );
  }
}

export default new TableAssignmentService();