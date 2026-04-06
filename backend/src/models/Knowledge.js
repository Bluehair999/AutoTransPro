const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Glossary = sequelize.define('Glossary', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    source: { type: DataTypes.STRING, allowNull: false },
    target: { type: DataTypes.STRING, allowNull: false }
  });

  const TM = sequelize.define('TM', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sourceHash: { type: DataTypes.STRING, allowNull: false },
    sourceText: { type: DataTypes.TEXT, allowNull: false },
    targetText: { type: DataTypes.TEXT, allowNull: false }
  });

  return { Glossary, TM };
};
