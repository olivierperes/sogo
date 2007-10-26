/* JavaScript for SOGoMail */
var accounts = {};
var mailboxTree;
var mailAccounts;
if (typeof textMailAccounts != 'undefined')
  mailAccounts = textMailAccounts.evalJSON(true);

var currentMessages = new Array();
var maxCachedMessages = 20;
var cachedMessages = new Array();
var currentMailbox = null;
var currentMailboxType = "";

var usersRightsWindowHeight = 320;
var usersRightsWindowWidth = 400;

var pageContent;

var deleteMessageRequestCount = 0;

var messageCheckTimer;

/* mail list */

function openMessageWindow(msguid, url) {
  var wId = '';
  if (msguid) {
    wId += "SOGo_msg_" + msguid;
    markMailReadInWindow(window, msguid);
  }
  var msgWin = openMailComposeWindow(url, wId);
  if (msguid) {
    msgWin.messageId = msguid;
    msgWin.messageURL = ApplicationBaseURL + currentMailbox + "/" + msguid;
  }
  msgWin.focus();

  return false;
}

function onMessageDoubleClick(event) {
  var action;

  if (currentMailboxType == "draft")
    action = "edit";
  else
    action = "popupview";

  return openMessageWindowsForSelection(action, true);
}

function toggleMailSelect(sender) {
  var row;
  row = $(sender.name);
  row.className = sender.checked ? "tableview_selected" : "tableview";
}

function openAddressbook(sender) {
  var urlstr;
   
  urlstr = ApplicationBaseURL + "/../Contacts/?popup=YES";
  var w = window.open(urlstr, "Addressbook",
		      "width=640,height=400,resizable=1,scrollbars=1,toolbar=0,"
		      + "location=no,directories=0,status=0,menubar=0,copyhistory=0");
  w.focus();

  return false;
}

function onMenuSharing(event) {
  var folderID = document.menuTarget.getAttribute("dataname");
  var type = document.menuTarget.getAttribute("datatype");

  if (type == "additional")
    window.alert(clabels["The user rights cannot be"
			 + " edited for this object!"]);
  else {
    var urlstr = URLForFolderID(folderID) + "/acls";
    openAclWindow(urlstr);
  }
}

/* mail list DOM changes */

function markMailInWindow(win, msguid, markread) {
  var msgDiv;

  msgDiv = win.$("div_" + msguid);
  if (msgDiv) {
    if (markread) {
      msgDiv.removeClassName("mailer_unreadmailsubject");
      msgDiv.addClassName("mailer_readmailsubject");
      msgDiv = win.$("unreaddiv_" + msguid);
      if (msgDiv)
	{
	  msgDiv.setAttribute("class", "mailerUnreadIcon");
	  msgDiv.setAttribute("id", "readdiv_" + msguid);
	  msgDiv.setAttribute("src", ResourcesURL + "/icon_read.gif");
	  msgDiv.setAttribute("onclick", "mailListMarkMessage(this,"
			      + " 'markMessageUnread', " + msguid
			      + ", false);"
			      +" return false;");
	  var title = msgDiv.getAttribute("title-markunread");
	  if (title)
	    msgDiv.setAttribute("title", title);
	}
    }
    else {
      msgDiv.removeClassName('mailer_readmailsubject');
      msgDiv.addClassName('mailer_unreadmailsubject');
      msgDiv = win.$("readdiv_" + msguid);
      if (msgDiv)
	{
	  msgDiv.setAttribute("class", "mailerReadIcon");
	  msgDiv.setAttribute("id", "unreaddiv_" + msguid);
	  msgDiv.setAttribute("src", ResourcesURL + "/icon_unread.gif");
	  msgDiv.setAttribute("onclick", "mailListMarkMessage(this,"
			      + " 'markMessageRead', " + msguid
			      + ", true);"
			      +" return false;");
	  var title = msgDiv.getAttribute("title-markread");
	  if (title)
	    msgDiv.setAttribute("title", title);
	}
    }
    return true;
  }
  else
    return false;
}

function markMailReadInWindow(win, msguid) {
  /* this is called by UIxMailView with window.opener */
  return markMailInWindow(win, msguid, true);
}

/* mail list reply */

function openMessageWindowsForSelection(action, firstOnly) {
  if (document.body.hasClassName("popup"))
    win = openMessageWindow(window.messageId,
			    window.messageURL + "/" + action);
  else {
    var messageList = $("messageList");
    var rows = messageList.getSelectedRowsId();
    if (rows.length > 0) {
      if (firstOnly)
	openMessageWindow(rows[0].substr(4),
			  ApplicationBaseURL + currentMailbox
			  + "/" + rows[0].substr(4)
			  + "/" + action);
      else
	for (var i = 0; i < rows.length; i++)
	  openMessageWindow(rows[i].substr(4),
			    ApplicationBaseURL + currentMailbox
			    + "/" + rows[i].substr(4)
			    + "/" + action);
    } else {
      window.alert(labels["Please select a message."]);
    }
  }

  return false;
}

function mailListMarkMessage(event) {
  var http = createHTTPClient();
  var url = ApplicationBaseURL + currentMailbox + "/" + msguid + "/" + action;

  if (http) {
    // TODO: add parameter to signal that we are only interested in OK
    http.open("POST", url, false /* not async */);
    http.send("");
    if (http.status != 200) {
      // TODO: refresh page?
      alert("Message Mark Failed: " + http.statusText);
      window.location.reload();
    }
    else {
      markMailInWindow(window, msguid, markread);
    }
  }
  else {
    window.location.href = url;
  }
}

/* maillist row highlight */

var oldMaillistHighlight = null; // to remember deleted/selected style

function ml_highlight(sender) {
  oldMaillistHighlight = sender.className;
  if (oldMaillistHighlight == "tableview_highlight")
    oldMaillistHighlight = null;
  sender.className = "tableview_highlight";
}

function ml_lowlight(sender) {
  if (oldMaillistHighlight) {
    sender.className = oldMaillistHighlight;
    oldMaillistHighlight = null;
  }
  else
    sender.className = "tableview";
}


/* bulk delete of messages */

function deleteSelectedMessages(sender) {
  var messageList = $("messageList");
  var rowIds = messageList.getSelectedRowsId();

  for (var i = 0; i < rowIds.length; i++) {
    var url, http;
    var rowId = rowIds[i].substr(4);
    var messageId = currentMailbox + "/" + rowId;
    url = ApplicationBaseURL + messageId + "/trash";
    deleteMessageRequestCount++;
    var data = { "id": rowId, "mailbox": currentMailbox, "messageId": messageId };
    triggerAjaxRequest(url, deleteSelectedMessagesCallback, data);
  }

  return false;
}

function deleteSelectedMessagesCallback(http) {
  if (http.readyState == 4) {
    if (isHttpStatus204(http.status)) {
      var data = http.callbackData;
      deleteCachedMessage(data["messageId"]);
      if (currentMailbox == data["mailbox"]) {
	
	var div = $('messageContent');
	if (currentMessages[currentMailbox] == data["id"]) {
	  div.update();
	  currentMessages[currentMailbox] = null;	
	}

	var row = $("row_" + data["id"]);
	row.parentNode.removeChild(row);

	deleteMessageRequestCount--;
      }
    }
  }
  else
    log ("deleteSelectedMessagesCallback: problem during ajax request " + http.status);
}

function moveMessages(rowIds, folder) {
  var failCount = 0;

  for (var i = 0; i < rowIds.length; i++) {
    var url, http;

    /* send AJAX request (synchronously) */
	  
    var messageId = currentMailbox + "/" + rowIds[i];
    url = (ApplicationBaseURL + messageId
	   + "/move?tofolder=" + folder);
    http = createHTTPClient();
    http.open("GET", url, false /* not async */);
    http.send("");
    if (http.status == 200) {
      var row = $("row_" + rowIds[i]);
      row.parentNode.removeChild(row);
      deleteCachedMessage(messageId);
      if (currentMessages[currentMailbox] == rowIds[i]) {
	var div = $('messageContent');
	div.update();
	currentMessages[currentMailbox] = null;
      }
    }
    else /* request failed */
      failCount++;

    /* remove from page */

    /* line-through would be nicer, but hiding is OK too */
  }

  if (failCount > 0)
    alert("Could not move " + failCount + " messages!");
   
  return failCount;
}

function onMenuDeleteMessage(event) {
  deleteSelectedMessages();
  preventDefault(event);
}

function onPrintCurrentMessage(event) {
  var rowIds = $("messageList").getSelectedRowsId();
  if (rowIds.length == 0) {
    window.alert(labels["Please select a message to print."]);
  }
  else if (rowIds.length > 1) {
    window.alert(labels["Please select only one message to print."]);
  }
  else
    window.print();

  preventDefault(event);
}

function onMailboxTreeItemClick(event) {
  var topNode = $("mailboxTree");
  var mailbox = this.parentNode.getAttribute("dataname");

  if (topNode.selectedEntry)
    topNode.selectedEntry.deselect();
  this.select();
  topNode.selectedEntry = this;

  search = {};
  sorting = {};
  $("searchValue").value = "";
  initCriteria();

  currentMailboxType = this.parentNode.getAttribute("datatype");
  if (currentMailboxType == "account" || currentMailboxType == "additional") {
    currentMailbox = mailbox;
    $("messageContent").update();
    var table = $("messageList");
    var head = table.tHead;
    var body = table.tBodies[0];
    for (var i = body.rows.length; i > 0; i--)
      body.deleteRow(i-1);
    if (head.rows[1])
      head.rows[1].firstChild.update();
  }
  else
    openMailbox(mailbox);
   
  Event.stop(event);
}

function _onMailboxMenuAction(menuEntry, error, actionName) {
  var targetMailbox = menuEntry.mailbox.fullName();

  if (targetMailbox == currentMailbox)
    window.alert(labels[error]);
  else {
    var message;
    if (document.menuTarget.tagName == "DIV")
      message = currentMessages[currentMailbox];
    else
      message = document.menuTarget.getAttribute("id").substr(4);

    var urlstr = (URLForFolderID(currentMailbox) + "/" + message
		  + "/" + actionName + "?folder=" + targetMailbox);
    triggerAjaxRequest(urlstr, folderRefreshCallback, currentMailbox);
  }
}

function onMailboxMenuMove(event) {
  _onMailboxMenuAction(this,
		       "Moving a message into its own folder is impossible!",
		       "move");
}

function onMailboxMenuCopy(event) {
  _onMailboxMenuAction(this,
		       "Copying a message into its own folder is impossible!",
		       "copy");
}

function refreshMailbox() {
  var topWindow = getTopWindow();
  if (topWindow)
    topWindow.refreshCurrentFolder();

  return false;
}

function onComposeMessage() {
  var topWindow = getTopWindow();
  if (topWindow)
    topWindow.composeNewMessage();

  return false;
}

function composeNewMessage() {
  var account = currentMailbox.split("/")[1];
  var url = ApplicationBaseURL + "/" + account + "/compose";
  openMailComposeWindow(url);
}

function openMailbox(mailbox, reload, idx) {
  if (mailbox != currentMailbox || reload) {
    currentMailbox = mailbox;
    var url = ApplicationBaseURL + encodeURI(mailbox) + "/view?noframe=1";
    var messageContent = $("messageContent");
    messageContent.update();
    lastClickedRow = null; // from generic.js

    var currentMessage;
    if (!idx) {
      currentMessage = currentMessages[mailbox];
      if (currentMessage) {
	loadMessage(currentMessage);
	url += '&pageforuid=' + currentMessage;
      }
    }

    var searchValue = search["value"];
    if (searchValue && searchValue.length > 0)
      url += ("&search=" + search["criteria"]
	      + "&value=" + escape(searchValue));
    var sortAttribute = sorting["attribute"];
    if (sortAttribute && sortAttribute.length > 0)
      url += ("&sort=" + sorting["attribute"]
	      + "&asc=" + sorting["ascending"]);
    if (idx)
      url += "&idx=" + idx;
    if (document.messageListAjaxRequest) {
      document.messageListAjaxRequest.aborted = true;
      document.messageListAjaxRequest.abort();
    }

    var mailboxContent = $("mailboxContent");
    if (mailboxContent.getStyle('visibility') == "hidden") {
      mailboxContent.setStyle({ visibility: "visible" });
      var rightDragHandle = $("rightDragHandle");
      rightDragHandle.setStyle({ visibility: "visible" });
      messageContent.setStyle({ top: (rightDragHandle.offsetTop
				      + rightDragHandle.offsetHeight
				      + 'px') });
    }
    document.messageListAjaxRequest
      = triggerAjaxRequest(url, messageListCallback,
			   currentMessage);

    var quotasUrl = ApplicationBaseURL + mailbox + "/quotas";
    document.quotasAjaxRequest
      = triggerAjaxRequest(quotasUrl, quotasCallback);
  }
}

function openMailboxAtIndex(event) {
  openMailbox(currentMailbox, true, this.getAttribute("idx"));

  Event.stop(event);
}

function messageListCallback(http) {
  var div = $('mailboxContent');
  var table = $('messageList');
  
  if (http.readyState == 4
      && http.status == 200) {
    document.messageListAjaxRequest = null;    

    if (table) {
      // Update table
      var thead = table.tHead;
      var tbody = table.tBodies[0];
      var tmp = document.createElement('div');
      $(tmp).update(http.responseText);
      thead.rows[1].parentNode.replaceChild(tmp.firstChild.tHead.rows[1], thead.rows[1]);
      table.replaceChild(tmp.firstChild.tBodies[0], tbody);
    }
    else {
      // Add table
      div.update(http.responseText);
      table = $('messageList');
      configureMessageListEvents(table);
      TableKit.Resizable.init(table, {'trueResize' : true, 'keepWidth' : true});
    }
    configureMessageListBodyEvents(table);

    var selected = http.callbackData;
    if (selected) {
      var row = $("row_" + selected);
      if (row) {
	row.select();
	lastClickedRow = row.rowIndex - $(row).up('table').down('thead').getElementsByTagName('tr').length;  
	div.scrollTop = row.rowIndex * row.getHeight(); // scroll to selected message
      }
      else
	$("messageContent").update();
    }
    else
      div.scrollTop = 0;
    
    if (sorting["attribute"] && sorting["attribute"].length > 0) {
      var sortHeader = $(sorting["attribute"] + "Header");
      
      if (sortHeader) {
	var sortImages = $(table.tHead).getElementsByClassName("sortImage");
	$(sortImages).each(function(item) {
	    item.remove();
	  });

	var sortImage = createElement("img", "messageSortImage", "sortImage");
	sortHeader.insertBefore(sortImage, sortHeader.firstChild);
	if (sorting["ascending"])
	  sortImage.src = ResourcesURL + "/title_sortdown_12x12.png";
	else
	  sortImage.src = ResourcesURL + "/title_sortup_12x12.png";
      }
    }
  }
  else {
    var data = http.responseText;
    var msg = data.replace(/^(.*\n)*.*<p>((.*\n)*.*)<\/p>(.*\n)*.*$/, "$2");
    log("messageListCallback: problem during ajax request (readyState = " + http.readyState + ", status = " + http.status + ", response = " + msg + ")");
  }
}

function quotasCallback(http) {
  if (http.readyState == 4
      && http.status == 200) {
    var hasQuotas = false;

    var quotas = http.responseText.evalJSON(true);
    for (var i in quotas) {
      hasQuotas = true;
      break;
    }

    if (hasQuotas) {
      var treePath = currentMailbox.split("/");
      var mbQuotas = quotas["/" + treePath[2]];
      var used = mbQuotas["usedSpace"];
      var max = mbQuotas["maxQuota"];
      var percents = (Math.round(used * 10000 / max) / 100);
      var format = labels["quotasFormat"];
      var text = format.formatted(used, max, percents);
      window.status = text;
    }
  }
}

function onMessageContextMenu(event) {
  var menu = $('messageListMenu');
  Event.observe(menu, "hideMenu", onMessageContextMenuHide);
  popupMenu(event, "messageListMenu", this);

  var topNode = $('messageList');
  var selectedNodes = topNode.getSelectedRows();
  for (var i = 0; i < selectedNodes.length; i++)
    selectedNodes[i].deselect();
  topNode.menuSelectedRows = selectedNodes;
  topNode.menuSelectedEntry = this;
  this.select();
}

function onMessageContextMenuHide(event) {
  var topNode = $('messageList');

  if (topNode.menuSelectedEntry) {
    topNode.menuSelectedEntry.deselect();
    topNode.menuSelectedEntry = null;
  }
  if (topNode.menuSelectedRows) {
    var nodes = topNode.menuSelectedRows;
    for (var i = 0; i < nodes.length; i++)
      nodes[i].select();
    topNode.menuSelectedRows = null;
  }
}

function onFolderMenuClick(event) {
  var onhide, menuName;
   
  var menutype = this.parentNode.getAttribute("datatype");
  if (menutype) {
    if (menutype == "inbox") {
      menuName = "inboxIconMenu";
    } else if (menutype == "account") {
      menuName = "accountIconMenu";
    } else if (menutype == "trash") {
      menuName = "trashIconMenu";
    } else {
      menuName = "mailboxIconMenu";
    }
  } else {
    menuName = "mailboxIconMenu";
  }

  var menu = $(menuName);
  Event.observe(menu, "hideMenu", onFolderMenuHide);
  popupMenu(event, menuName, this.parentNode);

  var topNode = $("mailboxTree");
  if (topNode.selectedEntry)
    topNode.selectedEntry.deselect();
  if (topNode.menuSelectedEntry)
    topNode.menuSelectedEntry.deselect();
  topNode.menuSelectedEntry = this;
  this.select();

  preventDefault(event);
}

function onFolderMenuHide(event) {
  var topNode = $("mailboxTree");

  if (topNode.menuSelectedEntry) {
    topNode.menuSelectedEntry.deselect();
    topNode.menuSelectedEntry = null;
  }
  if (topNode.selectedEntry)
    topNode.selectedEntry.select();
}

function deleteCachedMessage(messageId) {
  var done = false;
  var counter = 0;

  while (counter < cachedMessages.length
	 && !done)
    if (cachedMessages[counter]
	&& cachedMessages[counter]['idx'] == messageId) {
      cachedMessages.splice(counter, 1);
      done = true;
    }
    else
      counter++;
}

function getCachedMessage(idx) {
  var message = null;
  var counter = 0;

  while (counter < cachedMessages.length
	 && message == null)
    if (cachedMessages[counter]
	&& cachedMessages[counter]['idx'] == currentMailbox + '/' + idx)
      message = cachedMessages[counter];
    else
      counter++;

  return message;
}

function storeCachedMessage(cachedMessage) {
  var oldest = -1;
  var timeOldest = -1;
  var counter = 0;

  if (cachedMessages.length < maxCachedMessages)
    oldest = cachedMessages.length;
  else {
    while (cachedMessages[counter]) {
      if (oldest == -1
	  || cachedMessages[counter]['time'] < timeOldest) {
	oldest = counter;
	timeOldest = cachedMessages[counter]['time'];
      }
      counter++;
    }

    if (oldest == -1)
      oldest = 0;
  }

  cachedMessages[oldest] = cachedMessage;
}

function onMessageSelectionChange() {
  var rows = this.getSelectedRowsId();

  if (rows.length == 1) {
    var idx = rows[0].substr(4);

    if (currentMessages[currentMailbox] != idx) {
      currentMessages[currentMailbox] = idx;
      loadMessage(idx);
    }
  }
}

function loadMessage(idx) {
  if (document.messageAjaxRequest) {
    document.messageAjaxRequest.aborted = true;
    document.messageAjaxRequest.abort();
  }

  var cachedMessage = getCachedMessage(idx);

  if (cachedMessage == null) {
    var url = (ApplicationBaseURL + currentMailbox + "/"
	       + idx + "/view?noframe=1");
    document.messageAjaxRequest
      = triggerAjaxRequest(url, messageCallback, idx);
    markMailInWindow(window, idx, true);
  } else {
    var div = $('messageContent');
    div.update(cachedMessage['text']);
    cachedMessage['time'] = (new Date()).getTime();
    document.messageAjaxRequest = null;
    configureLinksInMessage();
    resizeMailContent();
  }
}

function configureLinksInMessage() {
  var messageDiv = $('messageContent');
  var mailContentDiv = document.getElementsByClassName('mailer_mailcontent',
						       messageDiv)[0];
  Event.observe(mailContentDiv, "contextmenu",
		onMessageContentMenu.bindAsEventListener(mailContentDiv));
  var anchors = messageDiv.getElementsByTagName('a');
  for (var i = 0; i < anchors.length; i++)
    if (anchors[i].href.substring(0,7) == "mailto:") {
      Event.observe(anchors[i], "click",
		    onEmailAddressClick.bindAsEventListener(anchors[i]));
      Event.observe(anchors[i], "contextmenu",
		    onEmailAddressClick.bindAsEventListener(anchors[i]));
    }
    else
      Event.observe(anchors[i], "click",
		    onMessageAnchorClick.bindAsEventListener(anchors[i]));

  var editDraftButton = $("editDraftButton");
  if (editDraftButton)
    Event.observe(editDraftButton, "click",
		  onMessageEditDraft.bindAsEventListener(editDraftButton));
}

function resizeMailContent() {
  var headerTable = document.getElementsByClassName('mailer_fieldtable')[0];
  var contentDiv = document.getElementsByClassName('mailer_mailcontent')[0];
  
  contentDiv.setStyle({ 'top': (Element.getHeight(headerTable) + headerTable.offsetTop) + 'px' });
}

function onMessageContentMenu(event) {
  popupMenu(event, 'messageContentMenu', this);
}

function onMessageEditDraft(event) {
  return openMessageWindowsForSelection("edit", true);
}

function onEmailAddressClick(event) {
  popupMenu(event, 'addressMenu', this);
}

function onMessageAnchorClick(event) {
  window.open(this.href);
  preventDefault(event);
}

function messageCallback(http) {
  var div = $('messageContent');

  if (http.readyState == 4
      && http.status == 200) {
    document.messageAjaxRequest = null;
    div.update(http.responseText);
    configureLinksInMessage();
    resizeMailContent();
    
    if (http.callbackData) {
      var cachedMessage = new Array();
      cachedMessage['idx'] = currentMailbox + '/' + http.callbackData;
      cachedMessage['time'] = (new Date()).getTime();
      cachedMessage['text'] = http.responseText;
      if (cachedMessage['text'].length < 30000)
	storeCachedMessage(cachedMessage);
    }
  }
  else
    log("messageCallback: problem during ajax request: " + http.status);
}

function processMailboxMenuAction(mailbox) {
  var currentNode, upperNode;
  var mailboxName;
  var action;

  mailboxName = mailbox.getAttribute('mailboxname');
  currentNode = mailbox;
  upperNode = null;

  while (currentNode
	 && !currentNode.hasAttribute('mailboxaction'))
    currentNode = currentNode.parentNode.parentNode.parentMenuItem;

  if (currentNode)
    {
      action = currentNode.getAttribute('mailboxaction');
      //       var rows  = collectSelectedRows();
      //       var rString = rows.join(', ');
      //       alert("performing '" + action + "' on " + rString
      //             + " to " + mailboxName);
    }
}

var rowSelectionCount = 0;

validateControls();

function showElement(e, shouldShow) {
  e.style.display = shouldShow ? "" : "none";
}

function enableElement(e, shouldEnable) {
  if(!e)
    return;
  if(shouldEnable) {
    if(e.hasAttribute("disabled"))
      e.removeAttribute("disabled");
  }
  else {
    e.setAttribute("disabled", "1");
  }
}

function validateControls() {
  var e = $("moveto");
  this.enableElement(e, rowSelectionCount > 0);
}

function moveTo(uri) {
  alert("MoveTo: " + uri);
}

function deleteSelectedMails() {
}

/* message menu entries */
function onMenuOpenMessage(event) {
  return openMessageWindowsForSelection('popupview');
}

function onMenuReplyToSender(event) {
  return openMessageWindowsForSelection('reply');
}

function onMenuReplyToAll(event) {
  return openMessageWindowsForSelection('replyall');
}

function onMenuForwardMessage(event) {
  return openMessageWindowsForSelection('forward');
}

function onMenuViewMessageSource(event) {
  var messageList = $("messageList");
  var rows = messageList.getSelectedRowsId();

  if (rows.length > 0) {
    var url = (ApplicationBaseURL + currentMailbox + "/"
	       + rows[0].substr(4) + "/viewsource");
    openMailComposeWindow(url);
  }

  preventDefault(event);
}

/* contacts */
function newContactFromEmail(event) {
  var mailto = document.menuTarget.innerHTML;

  var email = extractEmailAddress(mailto);
  var c_name = extractEmailName(mailto);
  if (email.length > 0)
    {
      var url = UserFolderURL + "Contacts/new?contactEmail=" + email;
      if (c_name)
	url += "&contactFN=" + c_name;
      openContactWindow(url);
    }

  return false; /* stop following the link */
}

function newEmailTo(sender) {
  return openMailTo(document.menuTarget.innerHTML);
}

function expandUpperTree(node) {
  var currentNode = node.parentNode;

  while (currentNode.className != "dtree") {
    if (currentNode.className == 'clip') {
      var id = currentNode.getAttribute("id");
      var number = parseInt(id.substr(2));
      if (number > 0) {
	var cn = mailboxTree.aNodes[number];
	mailboxTree.nodeStatus(1, number, cn._ls);
      }
    }
    currentNode = currentNode.parentNode;
  }
}

function onHeaderClick(event) {
  var headerId = this.getAttribute("id");
  var newSortAttribute;
  if (headerId == "subjectHeader")
    newSortAttribute = "subject";
  else if (headerId == "fromHeader")
    newSortAttribute = "from";
  else if (headerId == "dateHeader")
    newSortAttribute = "date";
  else
    newSortAttribute = "arrival";

  if (sorting["attribute"] == newSortAttribute)
    sorting["ascending"] = !sorting["ascending"];
  else {
    sorting["attribute"] = newSortAttribute;
    sorting["ascending"] = true;
  }
  refreshCurrentFolder();
  
  Event.stop(event);
}

function refreshCurrentFolder() {
  openMailbox(currentMailbox, true);
}

function refreshFolderByType(type) {
  if (currentMailboxType == type)
    refreshCurrentFolder();
}

var mailboxSpanAcceptType = function(type) {
  return (type == "mailRow");
}

var mailboxSpanEnter = function() {
  this.addClassName("_dragOver");
}

var mailboxSpanExit = function() {
  this.removeClassName("_dragOver");
}

var mailboxSpanDrop = function(data) {
  var success = false;

  if (data) {
    var folder = this.parentNode.parentNode.getAttribute("dataname");
    if (folder != currentMailbox)
      success = (moveMessages(data, folder) == 0);
  }
  else
    success = false;
  
  return success;
}
    
var plusSignEnter = function() {
  var nodeNr = parseInt(this.id.substr(2));
  if (!mailboxTree.aNodes[nodeNr]._io)
    this.plusSignTimer = setTimeout("openPlusSign('" + nodeNr + "');", 1000);
}
      
var plusSignExit = function() {
  if (this.plusSignTimer) {
    clearTimeout(this.plusSignTimer);
    this.plusSignTimer = null;
  }
}
	
function openPlusSign(nodeNr) {
  mailboxTree.nodeStatus(1, nodeNr, mailboxTree.aNodes[nodeNr]._ls);
  mailboxTree.aNodes[nodeNr]._io = 1;
  this.plusSignTimer = null;
}

var messageListGhost = function () {
  var newDiv = document.createElement("div");
  //   newDiv.style.width = "25px;";
  //   newDiv.style.height = "25px;";
  newDiv.style.backgroundColor = "#aae;";
  newDiv.style.border = "2px solid #a3a;";
  newDiv.style.padding = "5px;";
  newDiv.ghostOffsetX = 10;
  newDiv.ghostOffsetY = 5;

  var newImg = document.createElement("img");
  newImg.src = ResourcesURL + "/message-mail.png";

  var list = $("messageList");
  var count = list.getSelectedRows().length;
  newDiv.appendChild(newImg);
  newDiv.appendChild(document.createElement("br"));
  newDiv.appendChild(document.createTextNode(count + " messages..."));

  return newDiv;
}

var messageListData = function(type) {
  var rows = this.parentNode.parentNode.getSelectedRowsId();
  var msgIds = new Array();
  for (var i = 0; i < rows.length; i++)
    msgIds.push(rows[i].substr(4));

  return msgIds;
}

/* a model for a futur refactoring of the sortable table headers mechanism */
function configureMessageListEvents(table) {
  if (table) {
    table.multiselect = true;
    // Each body row can load a message
    Event.observe(table, "mousedown",
    		  onMessageSelectionChange.bindAsEventListener(table));    
    // Sortable columns
    configureSortableTableHeaders(table);
  }
}

function configureMessageListBodyEvents(table) {
  if (table) {
    // Page navigation
    var cell = table.tHead.rows[1].cells[0];
    if ($(cell).hasClassName("tbtv_navcell")) {
      var anchors = $(cell).childNodesWithTag("a");
      for (var i = 0; i < anchors.length; i++)
	Event.observe(anchors[i], "click", openMailboxAtIndex.bindAsEventListener(anchors[i]));
    }

    rows = table.tBodies[0].rows;
    for (var i = 0; i < rows.length; i++) {
      Event.observe(rows[i], "mousedown", onRowClick);
      Event.observe(rows[i], "selectstart", listRowMouseDownHandler);
      Event.observe(rows[i], "contextmenu", onMessageContextMenu.bindAsEventListener(rows[i]));
      
      rows[i].dndTypes = function() { return new Array("mailRow"); };
      rows[i].dndGhost = messageListGhost;
      rows[i].dndDataForType = messageListData;
//       document.DNDManager.registerSource(rows[i]);

      for (var j = 0; j < rows[i].cells.length; j++) {
	var cell = rows[i].cells[j];
	Event.observe(cell, "mousedown", listRowMouseDownHandler);
	if (j == 2 || j == 3 || j == 5)
	  Event.observe(cell, "dblclick", onMessageDoubleClick.bindAsEventListener(cell));
	else if (j == 4) {
	  var img = cell.childNodesWithTag("img")[0];
	  Event.observe(img, "click", mailListMarkMessage);
	}
      }
    }
  }
}

function configureDragHandles() {
  var handle = $("verticalDragHandle");
  if (handle) {
    handle.addInterface(SOGoDragHandlesInterface);
    handle.leftMargin = 1;
    handle.leftBlock=$("leftPanel");
    handle.rightBlock=$("rightPanel");
  }

  handle = $("rightDragHandle");
  if (handle) {
    handle.addInterface(SOGoDragHandlesInterface);
    handle.upperBlock=$("mailboxContent");
    handle.lowerBlock=$("messageContent");
  }
}

/* dnd */
function initDnd() {
  //   log("MailerUI initDnd");

  var tree = $("mailboxTree");
  if (tree) {
    var images = tree.getElementsByTagName("img");
    for (var i = 0; i < images.length; i++) {
      if (images[i].id[0] == 'j') {
	images[i].dndAcceptType = mailboxSpanAcceptType;
	images[i].dndEnter = plusSignEnter;
	images[i].dndExit = plusSignExit;
	document.DNDManager.registerDestination(images[i]);
      }
    }
    var nodes = document.getElementsByClassName("nodeName", tree);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].dndAcceptType = mailboxSpanAcceptType;
      nodes[i].dndEnter = mailboxSpanEnter;
      nodes[i].dndExit = mailboxSpanExit;
      nodes[i].dndDrop = mailboxSpanDrop;
      document.DNDManager.registerDestination(nodes[i]);
    }
  }
}

/* stub */

function refreshContacts() {
}

function openInbox(node) {
  var done = false;
  openMailbox(node.parentNode.getAttribute("dataname"));
  var tree = $("mailboxTree");
  tree.selectedEntry = node;
  node.select();
  mailboxTree.o(1);
}

function initMailer(event) {
  if (!document.body.hasClassName("popup")) {
//     initDnd();
    initMailboxTree();
    initMessageCheckTimer();
  }
}

function initMessageCheckTimer() {
  var messageCheck = userDefaults["MessageCheck"];
  if (messageCheck && messageCheck != "manually") {
    var interval;
    if (messageCheck == "once_per_hour")
      interval = 3600;
    else if (messageCheck == "every_minute")
      interval = 60;
    else {
      interval = parseInt(messageCheck.substr(6)) * 60;
    }
    messageCheckTimer = window.setInterval(onMessageCheckCallback,
					   interval * 1000);
  }
}

function onMessageCheckCallback(event) {
  refreshMailbox();
}

function initMailboxTree() {
  mailboxTree = new dTree("mailboxTree");
  mailboxTree.config.folderLinks = true;
  mailboxTree.config.hideRoot = true;

  mailboxTree.icon.root = ResourcesURL + "/tbtv_account_17x17.gif";
  mailboxTree.icon.folder = ResourcesURL + "/tbtv_leaf_corner_17x17.gif";
  mailboxTree.icon.folderOpen	= ResourcesURL + "/tbtv_leaf_corner_17x17.gif";
  mailboxTree.icon.node = ResourcesURL + "/tbtv_leaf_corner_17x17.gif";
  mailboxTree.icon.line = ResourcesURL + "/tbtv_line_17x17.gif";
  mailboxTree.icon.join = ResourcesURL + "/tbtv_junction_17x17.gif";
  mailboxTree.icon.joinBottom	= ResourcesURL + "/tbtv_corner_17x17.gif";
  mailboxTree.icon.plus = ResourcesURL + "/tbtv_plus_17x17.gif";
  mailboxTree.icon.plusBottom	= ResourcesURL + "/tbtv_corner_plus_17x17.gif";
  mailboxTree.icon.minus = ResourcesURL + "/tbtv_minus_17x17.gif";
  mailboxTree.icon.minusBottom = ResourcesURL + "/tbtv_corner_minus_17x17.gif";
  mailboxTree.icon.nlPlus = ResourcesURL + "/tbtv_corner_plus_17x17.gif";
  mailboxTree.icon.nlMinus = ResourcesURL + "/tbtv_corner_minus_17x17.gif";
  mailboxTree.icon.empty = ResourcesURL + "/empty.gif";

  mailboxTree.add(0, -1, '');

  mailboxTree.pendingRequests = mailAccounts.length;
  activeAjaxRequests += mailAccounts.length;
  for (var i = 0; i < mailAccounts.length; i++) {
    var url = ApplicationBaseURL + "/" + mailAccounts[i] + "/mailboxes";
    triggerAjaxRequest(url, onLoadMailboxesCallback, mailAccounts[i]);
  }
}

function updateMailboxTreeInPage() {
  $("folderTreeContent").update(mailboxTree);

  var inboxFound = false;
  var tree = $("mailboxTree");
  var nodes = document.getElementsByClassName("node", tree);
  for (i = 0; i < nodes.length; i++) {
    Event.observe(nodes[i], "click",
		  onMailboxTreeItemClick.bindAsEventListener(nodes[i]));
    Event.observe(nodes[i], "contextmenu",
		  onFolderMenuClick.bindAsEventListener(nodes[i]));
    if (!inboxFound
	&& nodes[i].parentNode.getAttribute("datatype") == "inbox") {
      openInbox(nodes[i]);
      inboxFound = true;
    }
  }
}

function mailboxMenuNode(type, name) {
  var newNode = document.createElement("li");
  var icon = MailerUIdTreeExtension.folderIcons[type];
  if (!icon)
    icon = "tbtv_leaf_corner_17x17.gif";
  var image = document.createElement("img");
  image.src = ResourcesURL + "/" + icon;
  newNode.appendChild(image);
  var displayName = MailerUIdTreeExtension.folderNames[type];
  if (!displayName)
    displayName = name;
  newNode.appendChild(document.createTextNode(" " + displayName));

  return newNode;
}

function generateMenuForMailbox(mailbox, prefix, callback) {
  var menuDIV = document.createElement("div");
  $(menuDIV).addClassName("menu");
  menuDIV.setAttribute("id", prefix + "Submenu");
  var menu = document.createElement("ul");
  menuDIV.appendChild(menu);
  pageContent.appendChild(menuDIV);

  var callbacks = new Array();
  if (mailbox.type != "account") {
    var newNode = document.createElement("li");
    newNode.mailbox = mailbox;
    newNode.appendChild(document.createTextNode(labels["This Folder"]));
    menu.appendChild(newNode);
    menu.appendChild(document.createElement("li"));
    callbacks.push(callback);
    callbacks.push("-");
  }

  var submenuCount = 0;
  for (var i = 0; i < mailbox.children.length; i++) {
    var child = mailbox.children[i];
    var newNode = mailboxMenuNode(child.type, child.name);
    menu.appendChild(newNode);
    if (child.children.length > 0) {
      var newPrefix = prefix + submenuCount;
      var newSubmenuId = generateMenuForMailbox(child, newPrefix, callback);
      callbacks.push(newSubmenuId);
      submenuCount++;
    }
    else {
      newNode.mailbox = child;
      callbacks.push(callback);
    }
  }
  initMenu(menuDIV, callbacks);

  return menuDIV.getAttribute("id");
}

function updateMailboxMenus() {
  var mailboxActions = { move: onMailboxMenuMove,
			 copy: onMailboxMenuCopy };

  for (key in mailboxActions) {
    var menuId = key + "MailboxMenu";
    var menuDIV = $(menuId);
    if (menuDIV)
      menuDIV.parentNode.removeChild(menuDIV);

    menuDIV = document.createElement("div");
    pageContent = $("pageContent");
    pageContent.appendChild(menuDIV);

    var menu = document.createElement("ul");
    menuDIV.appendChild(menu);

    $(menuDIV).addClassName("menu");
    menuDIV.setAttribute("id", menuId);

    var submenuIds = new Array();
    for (var i = 0; i < mailAccounts.length; i++) {
      var menuEntry = mailboxMenuNode("account", mailAccounts[i]);
      menu.appendChild(menuEntry);
      var mailbox = accounts[mailAccounts[i]];
      var newSubmenuId = generateMenuForMailbox(mailbox,
					      key, mailboxActions[key]);
      submenuIds.push(newSubmenuId);
    }
    initMenu(menuDIV, submenuIds);
  }
}

function onLoadMailboxesCallback(http) {
  if (http.readyState == 4
      && http.status == 200) {
    checkAjaxRequestsState();
    var newAccount = buildMailboxes(http.callbackData,
				    http.responseText);
    accounts[http.callbackData] = newAccount;
    mailboxTree.addMailAccount(newAccount);
    mailboxTree.pendingRequests--;
    activeAjaxRequests--;
    if (!mailboxTree.pendingRequests) {
      updateMailboxTreeInPage();
      updateMailboxMenus();
      checkAjaxRequestsState();
    }
  }

  //       var tree = $("mailboxTree");
  //       var treeNodes = document.getElementsByClassName("dTreeNode", tree);
  //       var i = 0;
  //       while (i < treeNodes.length
  // 	     && treeNodes[i].getAttribute("dataname") != currentMailbox)
  // 	 i++;
  //       if (i < treeNodes.length) {
  // 	 //     log("found mailbox");
  // 	 var links = document.getElementsByClassName("node", treeNodes[i]);
  // 	 if (tree.selectedEntry)
  // 	    tree.selectedEntry.deselect();
  // 	 links[0].select();
  // 	 tree.selectedEntry = links[0];
  // 	 expandUpperTree(links[0]);
  //       }
}

function buildMailboxes(accountName, encoded) {
  var account = new Mailbox("account", accountName);
  var data = encoded.evalJSON(true);
  for (var i = 0; i < data.length; i++) {
    var currentNode = account;
    var names = data[i].path.split("/");
    for (var j = 1; j < (names.length - 1); j++) {
      var node = currentNode.findMailboxByName(names[j]);
      if (!node) {
	node = new Mailbox("additional", names[j]);
	currentNode.addMailbox(node);
      }
      currentNode = node;
    }
    var basename = names[names.length-1];
    var leaf = currentNode.findMailboxByName(basename);
    if (leaf)
      leaf.type = data[i].type;
    else {
      leaf = new Mailbox(data[i].type, basename);
      currentNode.addMailbox(leaf);
    }
  }

  return account;
}

function onMenuCreateFolder(event) { log ("onMenuCreateFolder " + document.menuTarget);
  var name = window.prompt(labels["Name :"], "");
  if (name && name.length > 0) {
    var folderID = document.menuTarget.getAttribute("dataname");
    var urlstr = URLForFolderID(folderID) + "/createFolder?name=" + name; log ("create " + urlstr);
    triggerAjaxRequest(urlstr, folderOperationCallback);
  }
}

function onMenuRenameFolder(event) {
  var name = window.prompt(labels["Enter the new name of your folder :"]
			   ,
			   "");
  if (name && name.length > 0) {
    var folderID = document.menuTarget.getAttribute("dataname");
    var urlstr = URLForFolderID(folderID) + "/renameFolder?name=" + name;
    triggerAjaxRequest(urlstr, folderOperationCallback);
  }
}

function onMenuDeleteFolder(event) {
  var answer = window.confirm(labels["Do you really want to move this folder into the trash ?"]);
  if (answer) {
    var folderID = document.menuTarget.getAttribute("dataname");
    var urlstr = URLForFolderID(folderID) + "/deleteFolder";
    triggerAjaxRequest(urlstr, folderOperationCallback);
  }
}

function onMenuExpungeFolder(event) {
  var folderID = document.menuTarget.getAttribute("dataname");
  var urlstr = URLForFolderID(folderID) + "/expunge";
  triggerAjaxRequest(urlstr, folderRefreshCallback, folderID);
}

function onMenuEmptyTrash(event) {
  var folderID = document.menuTarget.getAttribute("dataname");
  var urlstr = URLForFolderID(folderID) + "/emptyTrash";
  triggerAjaxRequest(urlstr, folderOperationCallback, folderID);

  if (folderID == currentMailbox) {
    var div = $('messageContent');
    for (var i = div.childNodes.length - 1; i > -1; i--)
      div.removeChild(div.childNodes[i]);
    refreshCurrentFolder();
  }
  var msgID = currentMessages[folderID];
  if (msgID)
    deleteCachedMessage(folderID + "/" + msgID);
}

function _onMenuChangeToXXXFolder(event, folder) {
  var type = document.menuTarget.getAttribute("datatype");
  if (type == "additional")
    window.alert(labels["You need to choose a non-virtual folder!"]);
  else {
    var folderID = document.menuTarget.getAttribute("dataname");
    var number = folderID.split("/").length;
    if (number > 3)
      window.alert(labels["You need to choose a root subfolder!"]);
    else {
      var urlstr = URLForFolderID(folderID) + "/setAs" + folder + "Folder";
      triggerAjaxRequest(urlstr, folderOperationCallback);
    }
  }
}

function onMenuChangeToDraftsFolder(event) {
  return _onMenuChangeToXXXFolder(event, "Drafts");
}

function onMenuChangeToSentFolder(event) {
  return _onMenuChangeToXXXFolder(event, "Sent");
}

function onMenuChangeToTrashFolder(event) {
  return _onMenuChangeToXXXFolder(event, "Trash");
}

function onMenuLabelNone() {
  var rowId = document.menuTarget.getAttribute("id").substr(4);
  var messageId = currentMailbox + "/" + rowId;
  var urlstr = ApplicationBaseURL + messageId + "/removeAllLabels";
  triggerAjaxRequest(urlstr, messageFlagCallback,
		     { mailbox: currentMailbox, msg: rowId, label: null } );
}

function _onMenuLabelFlagX(flag) {
  var flags = document.menuTarget.getAttribute("labels").split(" ");

  var rowId = document.menuTarget.getAttribute("id").substr(4);
  var messageId = currentMailbox + "/" + rowId;

  var operation = "add";
  if (flags.indexOf("label" + flag) > -1)
    operation = "remove";
  var urlstr = (ApplicationBaseURL + messageId
		+ "/" + operation + "Label" + flag);
  triggerAjaxRequest(urlstr, messageFlagCallback,
		     { mailbox: currentMailbox, msg: rowId,
		       label: operation + flag } );
}

function onMenuLabelFlag1() {
  _onMenuLabelFlagX(1);
}

function onMenuLabelFlag2() {
  _onMenuLabelFlagX(2);
}

function onMenuLabelFlag3() {
  _onMenuLabelFlagX(3);
}

function onMenuLabelFlag4() {
  _onMenuLabelFlagX(4);
}

function onMenuLabelFlag5() {
  _onMenuLabelFlagX(5);
}

function folderOperationCallback(http) {
  if (http.readyState == 4
      && isHttpStatus204(http.status))
    initMailboxTree();
  else
    window.alert(labels["Operation failed"]);
}

function folderRefreshCallback(http) {
  if (http.readyState == 4
      && isHttpStatus204(http.status)) {
    var oldMailbox = http.callbackData;
    if (oldMailbox == currentMailbox)
      refreshCurrentFolder();
  }
  else
    window.alert(labels["Operation failed"]);
}

function messageFlagCallback(http) {
  if (http.readyState == 4
      && isHttpStatus204(http.status)) {
    var data = http.callbackData;
    if (data["mailbox"] == currentMailbox) {
      var row = $("row_" + data["msg"]);
      var operation = data["label"];
      if (operation) {
	var labels = row.getAttribute("labels");
	var flags;
	if (labels.length > 0)
	  flags = labels.split(" ");
	else
	  flags = new Array();
	if (operation.substr(0, 3) == "add")
	  flags.push("label" + operation.substr(3));
	else {
	  var flag = "label" + operation.substr(6);
	  var idx = flags.indexOf(flag);
	  flags.splice(idx, 1);
	}
	row.setAttribute("labels", flags.join(" "));
      }
      else
	row.setAttribute("labels", "");
    }
  }
}

function onLabelMenuPrepareVisibility() {
  var messageList = $("messageList");
  var rows = messageList.getSelectedRows();

  var flags = {};
  for (var i = 1; i < 6; i++)
    flags["label" + i] = true;
  for (var i = 0; i < rows.length; i++) {
    var rowFlags = rows[i].getAttribute("labels").split(" ");
    for (var flag in flags)
      if (flags[flag] && rowFlags.indexOf(flag) == -1)
	flags[flag] = false;
  }

  var lis = this.childNodesWithTag("ul")[0].childNodesWithTag("li")
  var isFlagged = false;
  for (var i = 1; i < 6; i++) {
    if (flags["label" + i]) {
      isFlagged = true;
      lis[1 + i].addClassName("_chosen");
    }
    else
      lis[1 + i].removeClassName("_chosen");
  }
  if (isFlagged)
    lis[0].removeClassName("_chosen");
  else
    lis[0].addClassName("_chosen");
}

function getMenus() {
  var menus = {}
  menus["accountIconMenu"] = new Array(null, null, onMenuCreateFolder, null,
				       null, null);
  menus["inboxIconMenu"] = new Array(null, null, null, "-", null,
				     onMenuCreateFolder, onMenuExpungeFolder,
				     "-", null,
				     onMenuSharing);
  menus["trashIconMenu"] = new Array(null, null, null, "-", null,
				     onMenuCreateFolder, onMenuExpungeFolder,
				     onMenuEmptyTrash, "-", null,
				     onMenuSharing);
  menus["mailboxIconMenu"] = new Array(null, null, null, "-", null,
				       onMenuCreateFolder,
				       onMenuRenameFolder,
				       onMenuExpungeFolder,
				       onMenuDeleteFolder,
				       "folderTypeMenu",
				       "-", null,
				       onMenuSharing);
  menus["addressMenu"] = new Array(newContactFromEmail, newEmailTo, null);
  menus["messageListMenu"] = new Array(onMenuOpenMessage, "-",
				       onMenuReplyToSender,
				       onMenuReplyToAll,
				       onMenuForwardMessage, null,
				       "-", "moveMailboxMenu",
				       "copyMailboxMenu", "label-menu",
				       "mark-menu", "-", null,
				       onMenuViewMessageSource, null,
				       null, onMenuDeleteMessage);
  menus["messageContentMenu"] = new Array(onMenuReplyToSender,
					  onMenuReplyToAll,
					  onMenuForwardMessage,
					  null, "moveMailboxMenu",
					  "copyMailboxMenu",
					  "-", "label-menu", "mark-menu",
					  "-",
					  null, onMenuViewMessageSource,
					  null, onPrintCurrentMessage,
					  onMenuDeleteMessage);
  menus["folderTypeMenu"] = new Array(onMenuChangeToSentFolder,
				      onMenuChangeToDraftsFolder,
				      onMenuChangeToTrashFolder);

  menus["label-menu"] = new Array(onMenuLabelNone, "-", onMenuLabelFlag1,
				  onMenuLabelFlag2, onMenuLabelFlag3,
				  onMenuLabelFlag4, onMenuLabelFlag5);
  menus["mark-menu"] = new Array(null, null, null, null, "-", null, "-",
				 null, null, null);
  menus["searchMenu"] = new Array(setSearchCriteria, setSearchCriteria,
				  setSearchCriteria, setSearchCriteria,
				  setSearchCriteria);
  var labelMenu = $("label-menu");
  if (labelMenu)
    labelMenu.prepareVisibility = onLabelMenuPrepareVisibility;

  return menus;
}

addEvent(window, 'load', initMailer);

function Mailbox(type, name) {
  this.type = type;
  this.name = name;
  this.parentFolder = null;
  this.children = new Array();
  return this;
}

Mailbox.prototype.dump = function(indent) {
  if (!indent)
    indent = 0;
  log(" ".repeat(indent) + this.name);
  for (var i = 0; i < this.children.length; i++) {
    this.children[i].dump(indent + 2);
  }
}

Mailbox.prototype.fullName = function() {
  var fullName = "";

  var currentFolder = this;
  while (currentFolder.parentFolder) {
    fullName = "/folder" + currentFolder.name + fullName;
    currentFolder = currentFolder.parentFolder;
  }

  return "/" + currentFolder.name + fullName;
}

Mailbox.prototype.findMailboxByName = function(name) {
  var mailbox = null;

  var i = 0;
  while (!mailbox && i < this.children.length)
    if (this.children[i].name == name)
      mailbox = this.children[i];
    else
      i++;

  return mailbox;
}

Mailbox.prototype.addMailbox = function(mailbox) {
  mailbox.parentFolder = this;
  this.children.push(mailbox);
}
