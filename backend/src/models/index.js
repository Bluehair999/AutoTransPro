const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

const User = require('./User')(sequelize);
const Project = require('./Project')(sequelize);
const { File, Page } = require('./FilePage')(sequelize);
const { Glossary, TM } = require('./Knowledge')(sequelize);

// Relations
Project.belongsTo(User, { as: 'Owner', foreignKey: 'ownerId' });
User.hasMany(Project, { foreignKey: 'ownerId' });

Project.hasMany(File, { as: 'files', foreignKey: 'projectId', onDelete: 'CASCADE' });
File.belongsTo(Project, { foreignKey: 'projectId' });

Project.hasMany(Glossary, { as: 'glossary', foreignKey: 'projectId' });
Glossary.belongsTo(Project, { foreignKey: 'projectId' });

// Project Members (Collaboration)
const ProjectMember = sequelize.define('ProjectMember', {
  role: { type: Sequelize.DataTypes.STRING, defaultValue: 'editor' }
});

Project.belongsToMany(User, { through: ProjectMember, as: 'Members' });
User.belongsToMany(Project, { through: ProjectMember });

const db = {
  sequelize,
  Sequelize,
  User,
  Project,
  File,
  Page,
  Glossary,
  TM,
  ProjectMember
};

module.exports = db;
