

# 实现JsBridge



### 一、JsBridge的用途

**构建Native和H5之间消息通信的通道**

- JS 向 Native 发送消息 : 调用相关功能、通知 Native 当前 JS 的相关状态等
- Native 向 JS 发送消息 : 回溯调用结果、消息推送、通知 JS 当前 Native 的状态等

### 二、JsBridge的实现原理

#### js调用native方法梳理

<img src="/Users/zhenglihuan/Library/Application Support/typora-user-images/image-20220525204929017.png" alt="image-20220525204929017" style="zoom:50%;" />

#### Native调用js方法梳理

<img src="/Users/zhenglihuan/Library/Application Support/typora-user-images/image-20220525205249728.png" alt="image-20220525205249728" style="zoom:50%;" />

#### 1、jsBridge主要有两种方式：注入API和拦截URL Scheme

##### 1.1、注入API

注入 API 方式的主要原理是，通过 WebView 提供的接口，向 JavaScript 的 Context（window）中注入对象或者方法，让 JavaScript 调用时，直接执行相应的 Native 代码逻辑，达到 JavaScript 调用 Native 的目的。

##### 1.1.1 ios端

- native调用js

```
    // UIWebview
    [webView stringByEvaluatingJavaScriptFromString:@"方法名(参数);"];
    // WKWebview
    [_customWebView evaluateJavaScript:[@"方法名(参数)"] completionHandler:nil];
    --------------------
    // js 调用 native
    // 引用官方库文件 UIWebview（ios8 以前的版本，建议弃用）
    #import <JavaScriptCore/JavaScriptCore.h>
    // webview 加载完毕后设置一些js接口
    -(void)webViewDidFinishLoad:(UIWebView *)webView{
        [self hideProgress];
        [self setJSInterface];
    }
    
    -(void)setJSInterface{ 
        JSContext *context =[_wv valueForKeyPath:@"documentView.webView.mainFrame.javaScriptContext"];
        // 注册名为foo的api方法
        context[@"foo"] = ^() {
        //获取参数
            NSArray *args = [JSContext currentArguments];
            NSString *title = [NSString stringWithFormat:@"%@",[args objectAtIndex:0]];
            //做一些自己的逻辑 返回一个值  'foo:'+title
            return [NSString stringWithFormat:@"foo:%@", title];
        };
    }
    window.foo('test'); // 返回 'foo:test'

```

- js调用native

```
  // 注意：ios7 以前 js无法调用native方法，ios7之后可以引入第三方提供的 JavaScriptCore 库
  /*
      总结：
      1. ios7 才出现这种方式，在这之前js无法直接调用Native，只能通过JSBridge方式调用
      2. JS 能调用到已经暴露的api，并且能得到相应返回值
      3. ios原生本身是无法被js调用的，但是通过引入官方提供的第三方“JavaScriptCore”，即可开发api给JS调用
  */
  // WKWebview  ios8之后才出现，js调用native方法
  // ios 代码配置 https://zhuanlan.zhihu.com/p/32899522
  // js调用
  window.webkit.messageHandlers.{name}.postMessage(msgObj);

  /*
      * 优缺点
      ios开发自带两种webview控件 UIWebview（ios8 以前的版本，建议弃用）版本较老，
      可使用JavaScriptCore来注入全局自定义对象
      占用内存大，加载速度慢
      WKWebview 版本较新 加载速度快，占用内存小
  */

```

##### 1.1.2 Android端

- native调用js

```
// 安卓4.4版本之前，无法获取返回值
// mWebView = new WebView(this); // 即当前webview对象
mWebView.loadUrl("javascript: 方法名('参数，需要转为字符串')")

// 安卓4.4及以后
//  webView.evaluateJavascript("javascript:if(window.callJS){window.callJS('" + str + "');}", new ValueCallback<String>() {
mWebView.evaluateJavascript("javascript: 方法名，参数需要转换为字符串", new ValueCallback() {
    @Override
    public void onReceiveValue(String value) {
    // 这里的value即为对应JS方法的返回值
    }
})

// js 在全局window上声明一个函数供安卓调用
window.callAndroid = function() {
    console.log('来自中h5的方法，供native调用')
    return "来自h5的返回值"
}

/** 总结：
  1. 4.4 之前Native通过loadUrl来调用js方法，只能让某个js方法执行，但是无法获取该方法的返回值
  2. 4.4 之后，通过evaluateJavaScript异步调用js方法，并且能在onReceive中拿到返回值
  3. 不适合传输大量数据
  4. mWebView.loadUrl("javascript: 方法名") 函数需在UI线程运行，因为mWebView为UI控件，会阻塞UI线程
*/

```

- JS调用Native

```
// 安卓环境配置
WebSettings webSettings = mWebView.getSettings();
// Android容器允许js脚本，必须要
webSettings.setJavaScriptEnabled(true);
// Android 容器设置侨连对象
mWebView.addJavascriptInterface(getJSBridge(), "JSBridge");

// Android中JSBridge的业务代码
private Object getJSBridge() {
    Object insterObj = new Object() {
        @JavascriptInterface
        public String foo() {
            // 此处执行 foo  bridge的业务代码
            return "foo" // 返回值
        }
        @JavascriptInterface
        public String foo2(final String param) {
            // 此处执行 foo2 方法  bridge的业务代码
            return "foo2" + param;
        }
    }
    return inserObj;
}
// js调用原生的代码
// JSBridge 通过addJavascriptInterface已被注入到 window 对象上了
window.JSBridge.foo(); // 返回 'foo'
window.JSBridge.foo2(); // 返回 'foo2:test'
// 注意：在安卓4.2之前 addJavascriptInterface有风险,hacker可以通过反编译获取Native注册的Js对象，然后在页面通过反射Java的内置 静态类，获取一些敏感的信息和破坏

```

##### 1.2、拦截Webview请求的URL Schema

URL Schema是类URL的一种请求格式，格式如下：

```
<protocol>://<host>/<path>?<qeury>#fragment
```

我们可以自定义JSBridge通信的URL Schema，比如：`jsbridge://showToast?text=hello`，**Web发送URL请求一般使用iframe.src**

- 安卓提供了shouldOverrideUrlLoading方法拦截
- UIWebview使用shouldStartLoadWithRequest,WKWebview则使用decidePolicyForNavigationAction

特点：兼容性好，由于基于URL方式，长度会受到限制而且不太直观，数据格式有限制，建立请求有时间消耗

#### 2、实现JSBridge

```

```

### 三、JSBridge如何引入

对于 JSBridge 的引用，常用有两种方式，各有利弊

##### 1、由 Native 端进行注入

注入方式和 Native 调用 JavaScript 类似，直接执行桥的全部代码。

优点：桥的版本很容易与 Native 保持一致，Native 端不用对不同版本的 JSBridge 进行兼容；

缺点：注入时机不确定，需要实现注入失败后重试的机制，保证注入的成功率，同时 JavaScript 端在调用接口时，需要优先判断 JSBridge 是否已经注入成功。

##### 2、由 JavaScript 端引用

直接与 JavaScript 一起执行。

优点：JavaScript 端可以确定 JSBridge 的存在，直接调用即可；

缺点：如果桥的实现方式有更改，JSBridge 需要兼容多版本的 Native Bridge 或者 Native Bridge 兼容多版本的 JSBridge。

### 四、开源的JSBridge

- DSBridge，主要通过注入API的形式，[DSBridge for Android](https://link.juejin.cn/?target=https%3A%2F%2Fgithub.com%2Fwendux%2FDSBridge-Android)、[DSBridge for IOS](https://link.juejin.cn/?target=https%3A%2F%2Fgithub.com%2Fwendux%2FDSBridge-IOS)
- JsBridge，主要通过拦截URL Schema，[JsBridge](https://link.juejin.cn/?target=https%3A%2F%2Fgithub.com%2Flzyzsd%2FJsBridge)

以`DSBridge-Android`为例：

```
// Web端代码
<body>
  <div>
    <button id="showBtn">获取Native输入，以Web弹窗展现</button>
  </div>
</body>
// 引入SDK
<script src="https://unpkg.com/dsbridge@3.1.3/dist/dsbridge.js"></script>
<script>
  const showBtn = document.querySelector('#showBtn');
  showBtn.addEventListener('click', e => {
    // 注意，这里代码不同：SDK在全局注册了dsBridge，通过call调用Native方法
    dsBridge.call('getNativeEditTextValue', '', value => {
      window.alert('Native输入值' + value);
    })
  });
</script>

```

```
// Android代码
// 使用dwebView替换原生webView
dwebView.addJavascriptObject(new JsApi(), null);

class JSApi {
  private Context ctx;
  public JSApi (Context ctx) {
    this.ctx = ctx;
  }

  @JavascriptInterface
  public void getNativeEditTextValue(Object msg, CompletionHandler<String> handler) {
    String value = ((MainActivity)ctx).editText.getText().toString();
    // 通过handler将value传给Web端，实现回调的JSB调用
    handler.completed(value);
  }
}

```

参考链接：

- https://juejin.cn/post/7034474588704768013#heading-3
- https://juejin.cn/post/6844903585268891662#heading-18
- https://juejin.cn/post/6936814903021797389#heading-9