window.onload = () => {
    class WuJie extends HTMLElement {
        constructor() {
            super();
            this.init();
            this.getAttr('url');
        }
        init() {
            const shadow = this.attachShadow({ mode: 'open' }); // 开启影子dom，也就是样式隔离
            const template = document.querySelector('#wu-jie');
            console.log(template);
            shadow.appendChild(template.content.cloneNode(true));
        }
        getAttr(attr) {
            console.log('获取属性：', this.getAttribute(attr));
        }
        //生命周期自动触发有东西插入
        connectedCallback() {
            console.log('类似于vue 的mounted');
        }
        //生命周期卸载
        disconnectedCallback() {
            console.log('类似于vue 的destory');
        }
        //跟watch类似
        attributeChangedCallback(name, oldVal, newVal) {
            console.log('跟vue 的watch 类似 有属性发生变化自动触发');
        }
    }
    window.customElements.define('wu-jie', WuJie);
};
