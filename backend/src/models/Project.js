const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Project = sequelize.define('Project', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    settings: { type: DataTypes.JSONB, defaultValue: {} },
    usage: { type: DataTypes.JSONB, defaultValue: { totalTokens: 0, estimatedCost: 0 } }
  });

  return Project;
};
