// uiCard.js: UI Card Component
console.log('uiCard.js loaded');

function getCommonCardHTML() {
    return `
        <div id="wqscope-id-card" style="position: absolute; padding:20px;">
            <div id="wqscope-id-card-data">
            <div class="idc-content">
                <b id="wqscope-title" class="idc-uname"></b>
            </div>
            <div id="wqscope-info"></div>
            </div>
        </div>
    `
}

function Card() {
    this.cardTitle = null;
    this.cardContent = null;

    this.dataId = null;
    this.data = {};
    this.cursorX = 0;
    this.cursorY = 0;
    this.enabled = false;
    this.wordCloud = null;
    this.lastDisable = 0;
    this.el = document.createElement("div");
    this.el.style.position = "absolute";
    this.el.innerHTML = getCommonCardHTML(); //this.data
    this.el.style.display = "none";
    this.disable();
    document.body.appendChild(this.el);
}

Card.prototype.enable = function (dataId) {
    if (dataId != null && dataId != this.dataId) {
        this.enabled = true;
        this.el.style.display = 'flex';
        return true;
    }
    return false;
}



Card.prototype.disable = function () {
    this.dataId = null;
    this.enabled = false;
    this.el.style.display = "none";
}


Card.prototype.updateCursor = function (cursorX, cursorY) {
    const cursorPadding = 10;
    const windowPadding = 20;

    this.cursorX = cursorX;
    this.cursorY = cursorY;

    if (this.el) {
        let width = this.el.scrollWidth;
        let height = this.el.scrollHeight;

        if (this.cursorX + width + windowPadding > window.scrollX + window.innerWidth) {
            // Will overflow to the right, put it on the left
            this.el.style.left = `${this.cursorX - cursorPadding - width}px`;
        } else {
            this.el.style.left = `${this.cursorX + cursorPadding}px`;
        }

        if (this.cursorY + height + windowPadding > window.scrollY + window.innerHeight) {
            // Will overflow to the bottom, put it on the top
            if (this.cursorY - windowPadding - height < window.scrollY) {
                // Can't fit on top either, put it in the middle
                this.el.style.top = `${window.scrollY + (window.innerHeight - height) / 2}px`;
            } else {
                this.el.style.top = `${this.cursorY - cursorPadding - height}px`;
            }
        } else {
            this.el.style.top = `${this.cursorY + cursorPadding}px`;
        }
    }
}


Card.prototype.updateDataId = function (dataId) {
    this.dataId = dataId;
}

Card.prototype.updateTargetHtml = function (targetHtml) {
    this.targetHtml = targetHtml;
    upc = this
    this.targetHtml.addEventListener("mouseleave", function leaveHandle(ev) {
        upc.disable();
        upc.lastDisable = Date.now();
        this.removeEventListener("mouseleave", leaveHandle);
    })
}

Card.prototype.updateData = function (cardTitle, cardContent) {
    this.el.innerHTML = getCommonCardHTML();
    this.el.style.display = "flex";

    document.getElementById("wqscope-title").innerHTML = cardTitle; //`${this.dataId} 排名信息`;
    document.getElementById("wqscope-info").innerHTML = cardContent;
}

var card = new Card();