import tableRepository from "./table.repository.js";

class TableAssignmentService {
  async findAvailableTables(
    restaurantId,
    guestCount,
    startTime,
    endTime
  ) {
    const tables =
      await tableRepository.findActiveTablesForRestaurant(
        restaurantId
      );

    const availableTables = [];

    for (const table of tables) {
      const reservations =
        await tableRepository.findTableReservations(
          table.id,
          startTime,
          endTime
        );

      if (reservations.length === 0) {
        availableTables.push(table);
      }
    }

    return availableTables;
  }

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

  async assignTables({
    restaurantId,
    guestCount,
    startTime,
    endTime,
  }) {
    const availableTables =
      await this.findAvailableTables(
        restaurantId,
        guestCount,
        startTime,
        endTime
      );

    return this.findBestTableCombination(
      availableTables,
      guestCount
    );
  }
}

export default new TableAssignmentService();