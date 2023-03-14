// const fs = require("fs");
const { resolve } = require('path')
const ZIP = require('./ZIP.js')

// 单个使用
new ZIP({
  projectName: 'project1',
  filePath: resolve(__dirname, `./project1`),
  distPath: resolve(__dirname, `./dist`)
})

// 多个项目
ZIP.makeWithGroup([
  {
    projectName: 'project1',
    filePath: resolve(__dirname, `./project2`),
    distPath: resolve(__dirname, `./dist`)
  },
  {
    projectName: 'project2',
    filePath: resolve(__dirname, `./project3`),
    distPath: resolve(__dirname, `./dist`)
  }
])
