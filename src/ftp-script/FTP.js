const fs = require('fs')
const { resolve } = require('path')
const Client = require('ftp')
const { Buffer } = require('buffer')
require('@michaelray/console-color')

// 获取目录下所有文件
function walk(dir, done) {
  let results = []
  fs.readdir(dir, function (err, list) {
    if (err) return done(err)
    let pending = list.length
    if (!pending) return done(null, results)
    list.forEach(function (file) {
      file = resolve(dir, file)
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            results = results.concat(res)
            if (!--pending) done(null, results)
          })
        } else {
          results.push(file)
          if (!--pending) done(null, results)
        }
      })
    })
  })
}
// 转码
function charset(str, encoding = 'utf8') {
  return Buffer.from(str, encoding).toString('utf8')
}
// 是否需要跳过删除或者上传
const checkSkip = function (filename) {
  return filename.includes('config')
}
class FTP {
  /**
   * 上传文件到 FTP 服务器
   * @param {Object:options} options // 配置
   * @param {String} options.projectName // 项目名称
   * @param {Function} options.checkSkip // 检查跳过文件的判断方法 回调参数时文件名 要求返回 Boolean
   * @param {Function} options.callback // 上传成功后的回调 可选
   * @param {Function} options.dest // 上传到服务器的路径
   * @param {String} options.host //链接FTP的ip或者域名
   * @param {String} options.port //链接FTP端口号
   * @param {String} options.user //链接FTP用户名
   * @param {String} options.password //链接FTP密码
   */
  constructor(options = {}) {
    if (!options?.projectName || !options?.projectPath) {
      throw new Error('参数错误')
    }
    const c = new Client()
    this.c = c
    this.isFirst = false
    this.checkSkip = typeof options?.checkSkip === 'function' ? options.checkSkip : checkSkip
    this.callback = typeof options?.callback === 'function' ? options.callback : null
    this.dest = options?.dest ?? null
    // 链接配置
    this.connectConfig = {
      host: options.host ,
      port: options.port,
      user: options.user,
      password: options.password
    }
    const self = this
    c.on('ready', function () {
      c._send(
        'OPTS UTF8 ON',
        function (err) {
          if (err) throw err
          const name = options?.projectName
          const path = self.getDestPath(name)
          c.list(path, function (err) {
            if (err) {
              // 文件夹不存在
              if (err.code === 550) {
                console.log(`文件夹:`.blue + `${name}`.yellow + `不存在，尝试创建文件夹...`.blue)
                self.isFirst = true
                self.mkdirAndUpload({
                  name,
                  projectPath: options?.projectPath,
                  destPath: path,
                  first: true
                })
              } else {
                throw err
              }
            } else {
              // 文件夹存在
              console.log('')
              console.log(`------------------ 开始删除旧文件 ------------------`.blue)
              console.log('')
              // 删除文件夹;
              self.rmdir(charset(path, 'latin1'), true, function (err) {
                if (err) throw err
                console.log('')
                console.log('------------------ 删除旧文件成功 ------------------'.blue)
                self.mkdirAndUpload({
                  name,
                  projectPath: options?.projectPath,
                  destPath: path,
                  first: false
                })
              })
            }
          })
        },
        true
      )
    })
  }
  getDestPath(name) {
    if (this.dest) {
      if (typeof this.dest === 'function') {
        return this.dest(name)
      }
      if (typeof this.dest === 'string') {
        return this.dest
      }
    }
    return '/' + name
  }
  // 开始
  start() {
    this.c.connect(this.connectConfig)
  }
  // 删除服务器文件夹
  rmdir(path, recursive, cb) {
    // RMD is optional
    if (typeof recursive === 'function') {
      cb = recursive
      recursive = false
    }
    if (!recursive) {
      return this.c._send('RMD ' + path, cb)
    }

    const self = this
    self.c.list(charset(path, 'latin1'), function (err, list) {
      if (err) return cb(err)
      let idx = 0

      // this function will be called once per listing entry
      let deleteNextEntry
      deleteNextEntry = function (err) {
        if (err) return cb(err)
        if (idx >= list.length) {
          if (list[0] && list[0].name === path) {
            return cb(null)
          } else {
            if (list.length) {
              return cb(null)
            }
            return self.rmdir(charset(path, 'latin1'), cb)
          }
        }

        let entry = list[idx++]

        // get the path to the file
        let subpath = null
        if (entry.name[0] === '/') {
          // this will be the case when you call deleteRecursively() and pass
          // the path to a plain file
          subpath = entry.name
        } else {
          if (path[path.length - 1] == '/') {
            subpath = path + entry.name
          } else {
            subpath = path + '/' + entry.name
          }
        }

        // delete the entry (recursively) according to its type
        if (entry.type === 'd') {
          if (entry.name === '.' || entry.name === '..') {
            return deleteNextEntry()
          }
          self.rmdir(subpath, true, deleteNextEntry)
        } else {
          subpath = charset(subpath, 'latin1')
          if (self.checkSkip(subpath)) {
            console.log(`检测到配置文件已跳过删除: ${subpath}`.yellowBG)
            return deleteNextEntry()
          }
          console.dir(`删除成功: ${subpath}`)
          self.c.delete(subpath, deleteNextEntry)
        }
      }
      deleteNextEntry()
    })
  }
  // 创建文件夹开始上传
  mkdirAndUpload({ name, projectPath, destPath, first }) {
    const self = this
    self.c.mkdir(charset(name), function (err) {
      if (err && err.code !== 550 && !err.message.includes('Cannot create a file when that file already exists')) {
        throw err
      } else {
        first && console.log(`创建文件夹`.blue + `${name}`.yellow + `成功`.blue)
        walk(projectPath, function (err, results) {
          if (err) throw err
          console.log('')
          console.log('------------------ 开始上传 ------------------'.blue)
          console.log('')
          results.forEach(function (filename, index) {
            ;(function (filename) {
              const sPath = destPath.replace('/', '\\') + filename.replace(projectPath, '')
              const isLast = index + 1 === results.length
              self.uploadFile(filename, sPath, isLast)
            })(filename)
          })
        })
      }
    })
  }
  // 上传文件
  uploadFile(filename, sPath, isLast) {
    if (!this.isFirst && this.checkSkip(filename)) {
      return console.log(`检测到配置文件已跳过上传: ${filename}`.yellowBG)
    }
    console.dir(`正在上传文件: ${filename}`)
    const self = this
    self.c.put(filename, charset(sPath), function (err) {
      if (err) {
        // 文件夹不存在
        if (err.code === 550) {
          let pathArr = sPath.split('\\')
          let currentPath = pathArr.slice(0, 2).join('\\')
          const paths = pathArr.slice(2, pathArr.length - 1).reverse()
          const done = function (err) {
            if (
              err &&
              err.code !== 550 &&
              !err.message.includes('Cannot create a file when that file already exists')
            ) {
              throw err
            } else {
              if (paths.length) {
                currentPath = currentPath + `\\${paths.pop()}`
                self.c.mkdir(charset(currentPath), done)
              } else {
                self.uploadFile(filename, sPath, isLast)
              }
            }
          }
          // console.log(currentPath + `\\${paths.pop()}`);
          currentPath = currentPath + `\\${paths.pop()}`
          self.c.mkdir(charset(currentPath), done)
        } else {
          throw err
        }
      } else {
        console.dir(`上传成功: ${sPath}`)
        if (isLast) {
          console.log('')
          console.log('------------------ 上传结束 ------------------'.blue)
          if (self.callback && typeof self.callback === 'function') {
            self.callback()
          }
        }
        self.c.end()
      }
    })
  }
  static groupUpload(items, callback) {
    const datas = items.slice()
    const upload = item => {
      console.log(`${item.projectName}：`.grey)
      const ftp = new FTP({
        projectName: item.projectName,
        projectPath: item.projectPath,
        callback: () => {
          if (datas.length) {
            upload(datas.pop())
          } else {
            callback && typeof callback === 'function' && callback()
          }
        }
      })
      ftp.start()
    }
    upload(datas.pop())
  }
}

module.exports = FTP
