/******************************************************************************
 project: "Stationery" extension for Thunderbird
 filename: composer_utils.jsm
 author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
 description: utility functions for composer window

 ******************************************************************************/

Components.utils.import("resource://stationery/content/stationery.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");

const EXPORTED_SYMBOLS = [];

Stationery.definePreference("ApplyStationery_New", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_MailToUrl", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ReplyAll", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ForwardAsAttachment", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ForwardInline", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_NewsPost", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ReplyToSender", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ReplyToGroup", {
    type   : "bool",
    default: true
});

Stationery.definePreference("ApplyStationery_ReplyToSenderAndGroup", {
    type   : "bool",
    default: true
});

//TODO: add preference to disable this entirely, and to disable parts ot it.
// this function remove many unused or harmful HMTL elements used in OE Stationery templates.
Stationery.cleanUpDomOfNewlyLoadedTemplate = function(editor /*nsIEditor*/) {

    function recurse(nodes) {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];

            // todo: remove only META with encoding, and Stationery metadata. in mail encoding is forced by MIME headers
            //line bellow remove <div> used in many OE stationery to auto-scrolloing (with script). I check it is empty, and if yes, then remove it.
            //another version of above, with table. I do not check content emptiness...
            //also OE propertiary markup inside comments
            if (node.nodeName === "SCRIPT"
                || node.nodeName === "BGSOUND"
                || node.nodeName === "LINK"
                || node.nodeName === "META"
                || node.nodeName === "BASE"
                || node.nodeName === "TITLE"
                || (node.nodeName === "DIV"
                    && node.hasAttribute("id")
                    && node.id.match(/^imageholder$/i)
                    && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i)
                    && (!node.nodeValue || node.nodeValue.match(/^\s*$/i)))
                || (node.nodeName === "TABLE"
                    && node.hasAttribute("id")
                    && node.id.match(/^imageholder$/i)
                    && node.hasAttribute("style") && node.getAttribute("style").match(/left\s*:\s*-1\s*px;\s*position\s*:\s*absolute;\s*top\s*:\s*-1\s*px;/i))
                || (node.nodeName === "#comment"
                    && node.nodeValue.match(/^webbot.*/i))
            ) {
                node.parentNode.removeChild(nodes[i--]); //decrement i, becasue "nodes" is now shorter by 1
            }
        }

        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].hasChildNodes()) {
                recurse(nodes[i].childNodes);
            }
        }
    }

    recurse(editor.rootElement.parentNode.childNodes);
};

Stationery.getTemplatePlaceholder = function(win, nodes, type) {
    if (!nodes) { //initialize recurrency
        return Stationery.getTemplatePlaceholder(win, win.GetCurrentEditor().rootElement.childNodes, type);
    }

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        if ((node.hasAttribute) && (node.getAttribute) && node.hasAttribute("stationery") && node.getAttribute("stationery") == type + "-placeholder") {
            return node;
        }

        if (node.hasChildNodes()) {
            const childNode = Stationery.getTemplatePlaceholder(win, node.childNodes, type);
            if (childNode) return childNode;
        }
    }

    return null;
};

Stationery.setCaretPosition = function(win) {
    try {
        const editor    = win.GetCurrentEditor();
        const caretSpan = editor.rootElement.childNodes[0].ownerDocument.getElementById("_AthCaret");

        if (caretSpan) {
            editor.selection.collapse(caretSpan, 0);
            caretSpan.parentNode.removeChild(caretSpan);

            win.updateCommands("style");
        }
    } catch (e) {

    }
};

Stationery.getSignatureNode = function(editor /*nsIEditor*/) {
    function recurse(nodes) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const node = nodes[i];

            if ((node.hasAttribute) && (node.getAttribute)
                && node.hasAttribute("class") && node.getAttribute("class") === "moz-signature"
                && !node.hasAttribute("stationery")
            ) {
                return node;
            }

            //search child nodes, but not "BLOCKQUOTE" ones. we do not want cited signature.
            if (node.hasChildNodes() && node.nodeName !== "BLOCKQUOTE") {
                const childNode = recurse(node.childNodes);

                if (childNode) {
                    return childNode;
                }
            }
        }

        return null;
    }

    return recurse(editor.rootElement.childNodes);
};

//fix <style> tag contents in blockquote.
// TB pastes there whole <style> tag from original email, and if this tag contain styles for <body> then all this mail CSS will be broken.
//fixes:
//  1) "body {" is replaced to "blockquote[cite="mid:003501c7af69$184fac50$7101a8c0@Antares"] {" where selector points to parent blockquote
//  2) all other tags gets blockquote[cite="mid:003501c7af69$184fac50$7101a8c0@Antares"] selector before their original selector.
Stationery.fixBlockquoteStyle = function(editor /*nsIEditor*/, nodes) {
    if (!nodes) {//need to initialize
        nodes = editor.rootElement.childNodes;
    }

    //TODO: now it fix only <style> blocks directly in <blockqoute>.
    //Change it to fix al <style> blocks, but do not go inside <blockquote> blocks that are fixed already. Or maybe fix them anyway? should not hurt.
    function updateCSSblock(node, id) {
        for (let i = 0; i < node.childNodes.length; i++) {
            const styleNode = node.childNodes[i];

            if (styleNode.nodeName === "STYLE") {
                let newContent = "";

                const rules = styleNode.sheet.cssRules;

                for (let r = 0; r < rules.length; r++) {
                    try { //some rules are more complex (@fontXX, @import), so there will be exteption. so just ignore this exception
                        newContent = newContent + id + " " //add ID before first selector
                            + rules[r].selectorText
                                      .replace(/body/igm, "") //clear 'body' selector
                                      .replace(id, " ") //clear existing 'id' selectors, to avoid double 'id' selector
                                      .replace(/,/igm, ",\n" + id) //add 'id' selector before any additional selector.
                            + " { " + rules[r].style.cssText + " }\n";
                    } catch (e) {

                    }
                }

                styleNode.textContent = newContent;
            }

            if (node.hasChildNodes() && (node.nodeName !== "BLOCKQUOTE")) {
                //do not steep into "BLOCKQUOTE".
                updateCSSblock(styleNode, id);
            }
        }
    }

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let id     = "";

        if (node.nodeName === "BLOCKQUOTE") {
            if (node.hasAttribute("id")) {
                id = node.getAttribute("id");
            } else {
                if (node.hasAttribute("cite")) {
                    id = node.getAttribute("cite");
                } else {
                    id = "Cite_" + Math.floor((Math.random() * 10000000));
                }
            }

            id = id.replace(/\W/g, "_");

            node.setAttribute("id", id);

            id = "#" + id; //make CSS selector

            updateCSSblock(node, id);

            Stationery.addClass(node, "cite"); //set class, to allow CSS styling for incompatible MS MUA
        }

        if (node.hasChildNodes()) {
            Stationery.fixBlockquoteStyle(editor, node.childNodes);
        }
    }
};

Stationery.fixImagesPaths = function(htmlDocument) {
};

function useFontPreview() {
    if (typeof useFontPreview.useFontPreview === "undefined") {
        useFontPreview.useFontPreview = Stationery.fontEnumerator.EnumerateAllFonts({value: 0}).length < 300;
    }

    return useFontPreview.useFontPreview;
}

function adjustAddressingWidget(wnd) {
    let linesNo = Stationery.getPref("AddresingWidgetLines");

    if (linesNo === 0) {
        //no change
        return;
    }

    while (linesNo > 10) {
        linesNo = linesNo / 10;
    }

    const addressingWidget  = wnd.document.getElementById("addressingWidget");
    const MsgHeadersToolbar = wnd.document.getElementById("MsgHeadersToolbar");

    //height of one row
    const oneRowHeight = wnd.document.getElementById("addressCol1#1").parentNode.boxObject.height;

    //how many height we need to add to get MsgHeadersToolbar height from rows height.
    //include all other elements on MsgHeadersToolbar except addressingWidget client area
    const extraHeight = 8 + MsgHeadersToolbar.boxObject.height - addressingWidget.boxObject.element.clientHeight;

    //set min and current height...
    MsgHeadersToolbar.removeAttribute("minheight");
    MsgHeadersToolbar.style.minHeight = "" + (oneRowHeight + extraHeight) + "px";
    MsgHeadersToolbar.style.height    = "" + (oneRowHeight * linesNo + extraHeight) + "px";

    //since TB 24 setting style.height is not enough, so I added line bellow:
    MsgHeadersToolbar.height = oneRowHeight * linesNo + extraHeight;

    //update addressingWidget internals
    wnd.awCreateOrRemoveDummyRows();
}

Stationery.onComposeBodyReady = function(wnd) {
    try {
        wnd.Stationery_.OriginalContent      = false;
        wnd.Stationery_.forceApplying        = false;
        wnd.Stationery_.templateCanBeChanged = wnd.gMsgCompose.compFields.draftId === "";

        Stationery.updateMenusInWindow(wnd);

        adjustAddressingWidget(wnd);
        wnd.Stationery_.ApplyTemplate();

        wnd.setTimeout(function() {
            wnd.document.getElementById("FontFaceSelect").setAttribute("maxwidth", 250);

            const FontFacePopup = wnd.document.getElementById("FontFacePopup");
            const nodes         = FontFacePopup.childNodes;

            nodes[1].setAttribute("style", "font-family: monospace !important;");
            nodes[3].setAttribute("style", "font-family: Helvetica, Arial, sans-serif !important;");
            nodes[4].setAttribute("style", "font-family: Times, serif !important;");
            nodes[5].setAttribute("style", "font-family: Courier, monospace !important;");

            //todo customize fonts AFTER composer is shown, as background task
            if (useFontPreview()) {
                for (let i = 7; i < nodes.length; ++i) {
                    const n = nodes[i];
                    n.setAttribute("style", "font-family: \"" + n.value + "\" !important;");
                    n.tooltipText = n.value;
                }
            }
        }, 0);
    } catch (e) {
        Stationery.handleException(e);
    }
};

Stationery.plainText2HTML = function(text) {
    const tagsToReplace = {
        "\r\n": "<br>",
        "\r"  : "<br>",
        "\n"  : "<br>",
        "&"   : "&amp;",
        "<"   : "&lt;",
        ">"   : "&gt;"
    };

    return text.replace(/\r\n|[\r\n&<>]/g, function(tag) {
        return tagsToReplace[tag] || tag;
    });
};

Stationery.HTML2PlainText = function(html) {
    const enc = Components.interfaces.nsIDocumentEncoder;

    return Stationery.parserUtils.convertToPlainText(
        html,
        enc.OutputFormatted || enc.OutputBodyOnly || enc.OutputCRLineBreak || end.OutputAbsoluteLinks || 0,
        0
    );
};

Stationery.getCurrentDictionaryData = function(win) {
    try {
        return win.gSpellChecker.mInlineSpellChecker.spellChecker.GetCurrentDictionary();
    } catch (e) {
        /* ignore errors, this happen when composer was just opened, spell check will be configured later anyway */
        return null;
    }
};

Stationery.restoreCurrentDictionaryData = function(win, oldDictionaryData) {
    if (oldDictionaryData != null) {
        win.setTimeout(function() {
            try {
                const names = win.gSpellChecker.mDictionaryNames;

                for (let i = 0; i < names.length; i++) {
                    if (names[i] == oldDictionaryData) {
                        win.gSpellChecker.selectDictionary(i);
                        return;
                    }
                }
            } catch (e) {
                Stationery.handleException(e);
            }
        }, 500);
    }
};
