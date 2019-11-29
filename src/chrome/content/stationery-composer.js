/******************************************************************************
 project: "Stationery" extension for Thunderbird
 filename: stationery-composer.js
 author: Łukasz 'Arivald' Płomiński <arivald@interia.pl>
 description: This is JS file for composer window.
 ******************************************************************************/

Components.utils.import("resource:///modules/iteratorUtils.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

Stationery_.ApplyTemplate = function() {
    try {
        document.getElementById("stationery-content-tab").selectedIndex = 0; //switch back to WYSIWYG tab

        //reset states...
        Stationery_.WYSIWYG_State = false;
        Stationery_.Source_State  = true;

        //prepare my overlay of composer to show HTML Source if needed.
        if (gMsgCompose.composeHTML && Stationery.getPref("SourceEditEnabled")) {
            //load editor into iframe
            Stationery.sourceEditor.initialize(window);

            //show editor page
            document.getElementById("stationery-content-tab").removeAttribute("collapsed");
        } else {
            document.getElementById("stationery-content-tab").setAttribute("collapsed", "true");
        }

        //do NOT apply stationery when when user open saved message (from drafts or templates)
        if (gMsgCompose.compFields.draftId) {
            return;
        }

        //do NOT apply stationery when automatic applying for this message type is not allowed,
        //but always apply if change of template was forced (from context menu)
        let mct              = Components.interfaces.nsIMsgCompType;
        let gMsgCompose_type = gMsgCompose.type;
        let applyStationery  = (arguments.length > 0 && arguments[0])
            || (gMsgCompose_type === mct.New && Stationery.getPref("ApplyStationery_New"))
            || (gMsgCompose_type === mct.MailToUrl && Stationery.getPref("ApplyStationery_MailToUrl"))
            || (gMsgCompose_type === mct.Reply && Stationery.getPref("ApplyStationery_ReplyToSender"))
            || (gMsgCompose_type === mct.ReplyToSender && Stationery.getPref("ApplyStationery_ReplyToSender"))
            || (gMsgCompose_type === mct.ReplyAll && Stationery.getPref("ApplyStationery_ReplyAll"))
            || (gMsgCompose_type === mct.ReplyToList && Stationery.getPref("ApplyStationery_ReplyAll"))
            || (gMsgCompose_type === mct.ForwardAsAttachment && Stationery.getPref("ApplyStationery_ForwardAsAttachment"))
            || (gMsgCompose_type === mct.ForwardInline && Stationery.getPref("ApplyStationery_ForwardInline"))
            || (gMsgCompose_type === mct.NewsPost && Stationery.getPref("ApplyStationery_NewsPost"))
            || (gMsgCompose_type === mct.ReplyToGroup && Stationery.getPref("ApplyStationery_ReplyToGroup"))
            || (gMsgCompose.type === mct.ReplyToSenderAndGroup && Stationery.getPref("ApplyStationery_ReplyToSenderAndGroup"));

        if (!applyStationery) {
            return;
        }

        Stationery_.compositionTypeFlag = "notForNewMail";

        if (gMsgCompose.type === mct.Reply
            || gMsgCompose.type === mct.ReplyToSender
            || gMsgCompose.type === mct.ReplyAll
            || gMsgCompose.type === mct.ReplyToList
            || gMsgCompose.type === mct.ReplyToGroup
            || gMsgCompose.type === mct.ReplyToSenderAndGroup) {
            Stationery_.compositionTypeFlag = "notForReply";
        }

        if (gMsgCompose.type === mct.ForwardAsAttachment || gMsgCompose.type === mct.ForwardInline) {
            Stationery_.compositionTypeFlag = "notForForward";
        }

        let identityKey             = Stationery.templates.getIdentityKey(window);
        Stationery_.currentTemplate = Stationery.templates.getCurrent(identityKey, Stationery_.compositionTypeFlag);

        //important: strong compare to "false" value!
        if (Stationery_.OriginalContent === false) {
            //on first applying Stationery_.OriginalContent is false.
            Stationery.fireEvent(window, "template-loading");

            if (gMsgCompose.composeHTML) {
                Stationery.fixBlockquoteStyle(window.GetCurrentEditor());
            }

            Stationery_.OriginalContent = gMsgCompose.editor.rootElement.innerHTML;

            if (Stationery_.OriginalContent === "<br>") {
                //editor adds one <br> if there is no content
                Stationery_.OriginalContent = "";
            }
        } else {
            Stationery.fireEvent(window, "template-reloading");
        }

        let dictionaryData = Stationery.getCurrentDictionaryData(window);

        if (gMsgCompose.composeHTML) {
            Stationery_.ApplyHTMLTemplate();
        }

        Stationery.fireEvent(window, "template-loaded");

        SetContentAndBodyAsUnmodified();

        //clear undo buffer
        gMsgCompose.editor.enableUndo(false);
        gMsgCompose.editor.enableUndo(true);

        Stationery.restoreCurrentDictionaryData(window, dictionaryData);
    } catch (e) {
        Stationery.handleException(e);
    }
};

Stationery_.SelectEditMode = function(mode, syncOnly) {
    try {
        if (window.gMsgCompose == null) {
            //function called when composer window is not constructed completly yet, just after overlay loads
            return;
        }

        //copy HTML from WYSIWYG to source, only when WYSIWYG is changed from last time. in other case leave source HTML untouched, user may do fixes manually
        if (mode === 1) {
            //note: strong compare is required!
            if (Stationery_.WYSIWYG_State !== window.GetCurrentEditor().getModificationCount()) {
                Stationery.sourceEditor.setHTML(window, "<html>\n" + window.GetCurrentEditor().rootElement.parentNode.innerHTML + "\n</html>", Stationery_.Source_State);

                Stationery_.Source_State  = false;
                Stationery_.WYSIWYG_State = window.GetCurrentEditor().getModificationCount();
            }

            //switch panes
            if (!syncOnly) {
                window.document.getElementById("stationery-content-source-box").removeAttribute("collapsed");
                window.document.getElementById("content-frame").setAttribute("collapsed", true);
            }
        }

        // user switches back to WYSIWYG, only when source is changed from last time. In other cases leave WYSIWYG untouched
        if (mode === 0) {
            if (Stationery.sourceEditor.isModified(window)) {
                window.gMsgCompose.editor.QueryInterface(Components.interfaces.nsIHTMLEditor).rebuildDocumentFromSource(Stationery.sourceEditor.getHTML(window));
                Stationery.sourceEditor.setNotModified(window);
                Stationery_.WYSIWYG_State = window.GetCurrentEditor().getModificationCount();
            }

            //switch panes
            if (!syncOnly) {
                window.document.getElementById("stationery-content-source-box").setAttribute("collapsed", true);
                window.document.getElementById("content-frame").removeAttribute("collapsed");
            }
        }
    } catch (e) {
        Stationery.handleException(e);
    }
};

Stationery_.ApplyPlainTemplate = function() {
};

Stationery_.ApplyHTMLTemplate = function() {
    let template   = Stationery_.currentTemplate;
    let HTMLEditor = gMsgCompose.editor.QueryInterface(Components.interfaces.nsIHTMLEditor);

    if (template.type === "blank") {
        gMsgCompose.editor.beginTransaction();

        try {
            HTMLEditor.rebuildDocumentFromSource("<html><body>" + Stationery_.OriginalContent + "</body></html>");
            loadHTMLMsgPrefs();

            return;
        } finally {
            gMsgCompose.editor.endTransaction();
        }
    }

    if (!Stationery.templates.load(window, template)) {
        return;
    }

    try {
        gMsgCompose.editor.beginTransaction();

        let html = "";

        if ("HTML" in template) {
            html = template.HTML;
        } else if ("Text" in template) {
            html = Stationery.plainText2HTML(template.Text);
        }

        HTMLEditor.rebuildDocumentFromSource(html);

        //todo: gather metadata before cleaning!
        Stationery.cleanUpDomOfNewlyLoadedTemplate(HTMLEditor);

        Stationery.templates.postprocess(template, HTMLEditor, gMsgCompose, Stationery_);

        //place content in placeholder if it exists
        let placeholder = Stationery.getTemplatePlaceholder(window, null, "content");

        if (!placeholder) {
            //if none found, just add dummy at end of template
            placeholder = window.GetCurrentEditor().rootElement.ownerDocument.createElement("div");

            window.GetCurrentEditor().rootElement.appendChild(placeholder);
        }

        let converter       = placeholder.ownerDocument.createElement("div");
        converter.innerHTML = Stationery_.OriginalContent;

        while (converter.childNodes.length > 0) {
            placeholder.parentNode.insertBefore(converter.childNodes[0], placeholder);
        }

        placeholder.parentNode.removeChild(placeholder);

        //place signature in placeholder if it exists.
        placeholder = Stationery.getTemplatePlaceholder(window, null, "signature");

        if (placeholder) {
            //clear placeholder prior to searching for signature node
            //this should prevent error in case when there is signature-like preview in placeholder node.
            //replaceChild: fastest way to clear
            let old_placeholder = placeholder;
            placeholder         = old_placeholder.cloneNode(false);

            old_placeholder.parentNode.replaceChild(placeholder, old_placeholder);

            let signatureNode = Stationery.getSignatureNode(window.GetCurrentEditor());

            //todo: check for case when placeholder is inside found signatureNode or better ignore such signature-like nodes
            if (signatureNode) {
                placeholder.parentNode.replaceChild(signatureNode, placeholder);
            } else {
                // remove signature placeholder if not used
                placeholder.parentNode.removeChild(placeholder);
            }
        }

        //move focus point to top of page
        let selectionController = gMsgCompose.editor.selectionController;

        selectionController.completeScroll(false);

        //setup caret position. it may update selection
        Stationery.setCaretPosition(window);

        //finally, scroll current selection into view
        selectionController.scrollSelectionIntoView(
            selectionController.SELECTION_NORMAL,
            selectionController.SELECTION_FOCUS_REGION,
            true
        );
    } finally {
        gMsgCompose.editor.endTransaction();
    }
};

Stationery_.onIdentityChanged = function(event) {
    if (!Stationery_.templateCanBeChanged || !Stationery.getPref("ChangeTemplateWithIdentity")) {
        return;
    }

    try {
        if (gMsgCompose.bodyModified && Stationery.getPref("ChangeTemplateWithIdentityConfirmation")) {
            let checkbox = {
                value: false
            };

            if (!Services.prompt.confirmCheck(event.view,
                Stationery._("changeConfirmation.windowTitle"),
                Stationery._("changeTemplateWithIdentityConfirmation.description"),
                Stationery._("changeConfirmation.label"),
                checkbox
            )) {
                //cancelled
                return;
            }

            Stationery.setPref("ChangeTemplateWithIdentityConfirmation", !checkbox.value);
        }

        //TODO: handle signature!!!
        /*
         intercept "function LoadIdentity(startup)".
         in this function check message, and set a flag is body is modified - so in onIdentityChanged we will just check this flag, not new body.
         also store old body, to be able to detect new signature (if any) inserted by LoadIdentity().

         */

        Stationery_.ApplyTemplate();
    } catch (e) {
        Stationery.handleException(e);
    }
};

stateListener.NotifyComposeBodyReady = function() {
    stateListener.orgNotifyComposeBodyReady();

    Stationery.onComposeBodyReady(window);

    let WYSIWYGEd = document.getElementById("content-frame");
    WYSIWYGEd     = WYSIWYGEd.getEditor(WYSIWYGEd.contentWindow);

    try {
        Stationery.fixImagesPaths(WYSIWYGEd.rootElement.ownerDocument);
    } catch (e) {
        Stationery.handleException(e);
    }
};

GenericSendMessage = function(msgType) {
    try {
        //synchronize WYSIWYG editor to Source editor, if currently user edit source.
        if (document.getElementById("stationery-content-tab").selectedIndex !== 0) {
            Stationery_.SelectEditMode(0, true);
        }
    } catch (ex) {

    }

    Stationery_.orignalGenericSendMessage(msgType);
};

MsgComposeCloseWindow = function(recycleIt) {
    if (recycleIt) {
        try {
            //delete content in HTML source editor
            Stationery.sourceEditor.finalize(window);

            //Switch WYSYWIG / Source tab to WYSYWIG mode.
            Stationery_.SelectEditMode(0, false);
        } catch (ex) {

        }
    }

    Stationery_.orignalMsgComposeCloseWindow(recycleIt);
};

Stationery_.orignalGenericSendMessage = GenericSendMessage;

Stationery_.orignalMsgComposeCloseWindow = MsgComposeCloseWindow;

//hijack stateListener.NotifyComposeBodyReady as good point to apply template
//adding my own listener is meaningless, because it will be registered before stateListener,
//hence stateListener still can broke template in loadHTMLMsgPrefs()
stateListener.orgNotifyComposeBodyReady = stateListener.NotifyComposeBodyReady;

window.addEventListener("load", function(event) {
    try {
        document.getElementById("msgcomposeWindow").addEventListener("compose-from-changed", Stationery_.onIdentityChanged, false);

        //when message is saved or send, disable ability to change template. It is too late anyway.
        document.getElementById("msgcomposeWindow").addEventListener("compose-send-message", function(event) {
            event.view.Stationery_.templateCanBeChanged = false;
            Stationery.updateMenusInWindow(event.view);
        }, false);

    } catch (e) {
        Stationery.handleException(e);
    }
}, false);

/*
 this function override and bypass default HTML-to-plaintext degradation if HTML is very simple.
 such degradation sometimes broke HTML messages, especially messages with a lot of CSS used.
 this function replace original function.
 */
function DetermineConvertibility() {
    if (gMsgCompose.composeHTML) {
        return nsIMsgCompConvertible.No;
    }

    return nsIMsgCompConvertible.Plain;
}
