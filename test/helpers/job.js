'use strict';


/**
 * Mock Job fixture
 * @type {object}
 */
module.exports = {
  handle: 'byrUamn6C05h',
  priority: 5,
  description: {
    callback: {
      request: {
        url: 'http://localhost:5978/job/update'
      }
    },
    resource: [
      {
        name: 'textfile',
        request: {
          url: 'http://localhost:5978/testFile.txt'
        }
      }
    ],
    save: ['textfile']
  }
}
