
/* eslint-disable @typescript-eslint/no-require-imports */
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

console.log('PGHOST:', process.env.PGHOST);
console.log('PGDATABASE:', process.env.PGDATABASE);

const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: PGHOST,
  port: Number(PGPORT) || 5432,
  username: PGUSER,
  password: PGPASSWORD,
  database: PGDATABASE,
  logging: false,
});

const Role = sequelize.define('roles', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: DataTypes.STRING
}, { timestamps: false });

async function listRoles() {
    try {
        await sequelize.authenticate();
        console.log('Connected.');
        const roles = await Role.findAll();
        console.log(JSON.stringify(roles, null, 2));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

listRoles();
