'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('projects', 'logo_url', {
      type: Sequelize.STRING(2048),
      allowNull: true,
      comment: 'Project logo image URL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('projects', 'logo_url');
  },
};
