
(function () {
  var id = 0,
        callbacks = {},
        registerFuncs = {};

  //获取手机系统
  var osType = function () {
    const u = navigator.userAgent
    return {
      ios: !!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/), //ios终端
      android: u.indexOf('Android') > -1 || u.indexOf('Adr') > -1, //android终端
    }
  }

  //

  window.JSBridge = {
    // native调用js
    invoke: function (bridgeName, callback, data) {
      // 获取回调函数的唯一id
      var currentId = id++
      callbacks[currentId] = callback

      //参数
      const params = {
        bridgeName:bridgeName,
        callbackId:callbackId,
        data:data || {},
      }

      // 安卓端js调用native
      if (osType.isAndroid) {
        window.nativeBridge.postMessage(JSON.stringify(params))
      }

      // ios端js调用native
      if (osType.isIos) {
        window.webkit.messageHandlers[bridgeName].postMessage(JSON.stringify(params))
      }

      // schema实现方式
      // var url = scheme://ecape(JSON.stringify(param))
      // var iframe = document.createElment('iframe');
      // iframe.src = url;
      // iframe.width = 0;
      // iframe.height = 0
      // document.head.appendChild(iframe);
      // setTimeout(() => document.head.removeChild('iframe'), 200)
    },

    // native回调js的方法
    receiveMessage: function (msg) {
      var bridgeName = msg.bridgeName,
        data = msg.data || {},
        callbackId = msg.callbackId, // Native 将 callbackId 原封不动传回
        responseId = msg.responseId;
      // bridgeName 和 callbackId 不会同时存在
      // 执行回调函数，获取native传递过来的数据
      if (callbackId) {
        if (callbacks[callbackId]) {
          callbacks[callbackId](data)
        }
      } else if (bridgeName) {
        // native直接调用js已注册的方法
        if (registerFuncs[bridgeName]) {
          var ret = {},
            flag = false;
          registerFuncs[bridgeName].forEach(function (callback) {
            callback(data, function (r) {
              flag = true
              ret = Object.assign(ret,r)
            })
          })
          if (flag) {
            nativeBridge.postMessage({
              responseId: responseId,
              ret:ret
            })
          }
        }
      }


    },

    // 注册方法,供native调用
    register: function (bridgeName, callback) {
      if (!registerFuncs[bridgeName]) {
        registerFuncs[bridgeName] = []
      }
      registerFuncs[bridgeName].push(callback)
    }
  }
})()

