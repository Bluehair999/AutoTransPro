const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const File = sequelize.define('File', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    mimetype: { type: DataTypes.STRING },
    path: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    usageStats: { type: DataTypes.JSONB, defaultValue: {} }
  });

  const Page = sequelize.define('Page', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    pageNumber: { type: DataTypes.INTEGER, allowNull: false },
    originalText: { type: DataTypes.TEXT },
    translatedText: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    method: { type: DataTypes.STRING },
    warnings: { type: DataTypes.JSONB, defaultValue: [] },
    score: { type: DataTypes.INTEGER, defaultValue: 100 }
  });

  File.hasMany(Page, { as: 'pages', foreignKey: 'fileId', onDelete: 'CASCADE' });
  Page.belongsTo(File, { foreignKey: 'fileId' });

  return { File, Page };
};
