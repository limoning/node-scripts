const FTP = require('./FTP.js')
const { resolve } = require('path')
const ftp = new FTP({
  projectName: 'test',
  projectPath: resolve(__dirname, './test')
})
ftp.start()
