'use strict';


/**
 * Exporting the model
 * @param {object} sequelize
 * @param {object} DataTypes
 * @return {object}
 */
module.exports = function(sequelize,DataTypes) {
  return sequelize.define('Master',{
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-]+$/,
          min: 3,
          max: 32
        }
      },
      domain: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          is: /^[a-z0-9\-\.]+$/,
          min: 3,
          max: 32
        }
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIPv4: true
        }
      },
      port: {
        type: DataTypes.INTEGER(5).UNSIGNED,
        allowNull: false,
        validate: {
          isNumeric: true
        }
      }
    },
    {
      indexes: [
        {
          name: 'name_unique',
          unique: true,
          method: 'BTREE',
          fields: ['name']
        },
        {
          name: 'domain_unique',
          unique: true,
          method: 'BTREE',
          fields: ['domain']
        }
      ]
    }
  )
}