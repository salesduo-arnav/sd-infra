'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tablesToUpdate = [
        { tableName: 'subscriptions', columns: ['plan_id', 'bundle_id'] },
        { tableName: 'one_time_purchases', columns: ['plan_id', 'bundle_id'] }
      ];

      for (const { tableName, columns } of tablesToUpdate) {
        // Get all FKs for the table
        const constraints = await queryInterface.getForeignKeyReferencesForTable(tableName, { transaction });
        
        for (const column of columns) {
          const constraint = constraints.find(c => c.columnName === column);
          
          if (constraint) {
            console.log(`Updating ${tableName}.${column} constraint: ${constraint.constraintName}`);
            
            // Remove existing constraint (SET NULL)
            await queryInterface.removeConstraint(tableName, constraint.constraintName, { transaction });
            
            // Add new constraint (RESTRICT)
            await queryInterface.addConstraint(tableName, {
              fields: [column],
              type: 'foreign key',
              name: constraint.constraintName, // Reusing the same name
              references: {
                table: constraint.referencedTableName,
                field: constraint.referencedColumnName
              },
              onDelete: 'RESTRICT',
              onUpdate: 'CASCADE',
              transaction
            });
          } else {
             console.warn(`Constraint for ${tableName}.${column} not found.`);
          }
        }
      }

      await transaction.commit();
    } catch (err) {
      console.error('Migration Failed:', err);
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Revert to SET NULL
       const tablesToUpdate = [
        { tableName: 'subscriptions', columns: ['plan_id', 'bundle_id'] },
        { tableName: 'one_time_purchases', columns: ['plan_id', 'bundle_id'] }
      ];

      for (const { tableName, columns } of tablesToUpdate) {
        const constraints = await queryInterface.getForeignKeyReferencesForTable(tableName, { transaction });
        
        for (const column of columns) {
          const constraint = constraints.find(c => c.columnName === column);
          
          if (constraint) {
            await queryInterface.removeConstraint(tableName, constraint.constraintName, { transaction });
            
            await queryInterface.addConstraint(tableName, {
              fields: [column],
              type: 'foreign key',
              name: constraint.constraintName,
              references: {
                table: constraint.referencedTableName,
                field: constraint.referencedColumnName
              },
              onDelete: 'SET NULL', // Reverting to original
              onUpdate: 'CASCADE',
              transaction
            });
          }
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
