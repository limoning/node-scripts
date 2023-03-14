const fs = require('fs')
const archiver = require('archiver')
require('@michaelray/console-color')
// 格式化文件大小 传入值 单位为KB
function formatSize(size) {
  if (size < 1024) {
    return `${size} KB`
  }
  return `${parseFloat((size / 1024).toFixed(2))} MB`
}

function createZipName(name, type) {
  const date = new Date()
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear().toString()
  const dateStr = y + m + d
  const zipName = name + '_' + dateStr + '.' + type
  return zipName
}

class ZIP {
  /**
   * 生成压缩包
   * @param {Object:options} options 项目配置
   * @param {Object:options} options.projectName 项目名称
   * @param {Object:options} options.filePath 要打包的文件目录
   * @param {Object:options} options.distPath 打包后的文件存放目录
   * @param {Object:options} options.type 打包类型 支持 zip tar
   * @param {Object:options} options.createZipName 货物打包后文件名 可选默认 projectName + _年月日 + 打包类型后缀
   */
  constructor(options = {}) {
    this.projectName = options.projectName // 项目名称
    this.filePath = options.filePath // 要打包的文件目录
    this.distPath = options.distPath // 打包后的文件存放目录
    this.type = options.type || 'zip' // 打包类型 支持 zip tar
    // 货物打包后文件名 可选默认 projectName + _年月日 + 打包类型后缀
    this.createZipName = options?.createZipName === 'function' ? options.createZipName : createZipName
    // 批量操作时内部用
    this.successCallback = options.successCallback || null
    // 批量操作时为 false
    const auto = options.auto ?? true
    auto && this.start()
  }
  // 开始压缩
  start() {
    console.log('-------------- start making --------------'.magenta)
    this.makeZip()
  }
  // 压缩
  makeZip() {
    const zipName = this.createZipName(this.projectName, this.type)
    // 判断 dist 文件加是否存在 不存在则创建
    try {
      fs.accessSync(this.distPath, fs.constants.R_OK | fs.constants.W_OK)
    } catch (err) {
      fs.mkdirSync(this.distPath, { recursive: true })
    }
    const outputPath = this.distPath + `/${zipName}`
    const output = fs.createWriteStream(outputPath)
    const archive = archiver(this.type, {
      zlib: { level: 9 } // Sets the compression level.
    })
    archive.on('error', function (err) {
      throw err
    })
    const self = this
    output.on('close', function () {
      const size = Math.round(archive.pointer() / 1024)
      if (self.successCallback && typeof self.successCallback === 'function') {
        return self.successCallback({
          name: self.projectName,
          size,
          path: outputPath
        })
      }
      console.log('')
      console.log(`------------- make successfully! --------------------`.green)
      console.log(
        `You can check it out here: `.grey + `${self.distPath}`.yellow + ' :'.grey + ` ${formatSize(size)}`.blue
      )
      console.log('')
    })
    archive.pipe(output)
    archive.directory(this.filePath, '/')
    archive.finalize()
  }
  /**
   * 批量处理
   * @param {Array[Object:options]} group 多个打包项目配置
   * @param {Object:options} options // 通用配置，在此配置的会合并到项目配置中，以项目配置为主
   */
  static makeWithGroup(group, options = {}) {
    const results = []
    console.log('-------------- start making zip --------------'.magenta)
    group.forEach(item => {
      const zip = new ZIP({
        ...options,
        ...item,
        successCallback: item => {
          results.push(item)
          // 打包完成
          if (results.length === group.length) {
            ZIP.logMakeInfo(results)
          }
        },
        auto: false
      })
      zip.makeZip()
    })
  }
  // 批量操作归并打印输出
  static logMakeInfo(results) {
    console.log('')
    console.log(`------------- make successfully! --------------------`.green)
    console.log('')
    console.log(`You can check it out here: `.grey)
    results.forEach(item => {
      console.log(`${item.path}`.yellow + ' :'.grey + ` ${formatSize(item.size)}`.blue)
    })
    console.log('')
  }
}

module.exports = ZIP
