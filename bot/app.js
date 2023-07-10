const TelegramBot = require("node-telegram-bot-api");
const server = require("../bot/server.json");
const axios = require("axios").default;
const orchestrator = require("../bot/orchestrator.js");
const { query } = require("express");

const botMessage = "Survelliance Notification Sent @ " + new Date().toISOString();

// Create a bot that uses 'polling' to fetch new updates
var bot;

axios.defaults.headers.common["Authorization"] = "ApiToken " + server.env.target.credentials.token;

function loadBackgroundData() {
  fetchData(server.env.target.endpoints.pathogenOptionSet).then(function (res) {
    server.env.target.endpoints.props[server.env.target.endpoints.pathogenOptionSet].data = res.data.options
    console.log('Successfully loaded the Pathogen OptionSet')
  })

  fetchData(server.env.target.endpoints.labTestResultOptionSet).then(function (res) {
    server.env.target.endpoints.props[server.env.target.endpoints.labTestResultOptionSet].data = res.data.options
    console.log('Successfully loaded the LabResult OptionSet')
  })
}

function fetchData(endpoint) {
  let route = server.env.target.endpoints.props[endpoint]
  let queryUrl = server.env.target.uri + route.path;

  return axios.get(queryUrl)
}

function lookUp(initialValue) {
  let foundMatch = initialValue
  for (let x = server.env.target.endpoints.pathogenOptionSet; x <= server.env.target.endpoints.labTestResultOptionSet; x++) {
    let lookUpMatch = server.env.target.endpoints.props[x].data.find(item => item.code == initialValue)

    if (lookUpMatch) {
      foundMatch = lookUpMatch.name
      break;
    }
  }
  return foundMatch
}

exports.initialize = function () {
  var botToken = (server.env.prod == true) ? server.env.bot.prod.token : server.env.bot.dev.token;

  bot = new TelegramBot(botToken, { polling: true });

  console.log("Bot Initialized");

  loadBackgroundData()

  bot.onText(/\/echo (.+)/, (msg, match) => {
    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message
    const chatId = msg.chat.id;
    const resp = match[1]; // the captured "whatever"
    const ecoResp = "/echo command is entered";

    console.log(ecoResp);

    // send back the matched "whatever" to the chat
    bot.sendMessage(chatId, ecoResp);
  });

  bot.on("message", (msg) => {
    const chatId = msg.chat.id;

    console.log(
      "Chat message recieved from: " +
      msg.chat.first_name +
      " " +
      msg.chat.last_name
    );
    console.log("\n");
    console.log(msg);

    // send a message to the chat acknowledging receipt of their message
    if (msg.text != null) {
      orchestrator.respond(msg)
        .then(
          result => orchestrator.handleBotResponse(result, bot, chatId),
          error => orchestrator.handleBotResponse(error, bot, chatId)
        )
    }
  });
};

exports.login = function () {
  let queryUrl =
    server.env.target.uri +
    server.env.target.endpoints.props[server.env.target.endpoints.login].path;

  axios
    .get(queryUrl)
    .then((res) => console.log("Login result" + JSON.stringify(res.data)))
    .catch((err) => console.log(err));
};

exports.checkUserName = async function (userName) {
  let route = server.env.target.endpoints.props[server.env.target.endpoints.checkUserName];
  let queryUrl = server.env.target.uri + route.path;

  queryUrl = queryUrl.replace(route.placeholder, userName);

  return axios.get(queryUrl);
};

exports.checkUserCredentials = async function (userName, userPassword) {
  let route = server.env.target.endpoints.props[server.env.target.endpoints.login];
  let queryUrl = server.env.target.uri + route.path;

  const authToken = Buffer.from(`${userName}:${userPassword}`, 'utf8').toString('base64') //https://flaviocopes.com/axios-send-authorization-header/

  return axios.get(queryUrl, { headers: { 'Authorization': `Basic ${authToken}` } })
}

exports.pushMessage = function (userID, message) {
  if (message == null) message = botMessage;

  bot.sendMessage(userID, message);
};

exports.addToNotificationsQueue = function (message, template, queue) {

  let queueItem = {
    id: message[server.env.bot.model.constants.props[server.env.bot.model.constants.duplicationPrevention].value],
    expectedValues: (template.split('{').length - 1),
    currentValues: 1,
    notification: "",
    ready: false,
    notified: false,
    updated: false,
    values: []
  }

  queueItem = this.updateQueueItemValues(message, template, queueItem)

  queueItem.notification = this.draftNotification(template, message)

  queue.push(queueItem)

  return queueItem;
}

exports.updateQueueItemValues = function (message, template, queueItem) {
  let contentKeys = Object.keys(message);

  //Add orgunit value
  if (queueItem.values.find(item => item.key == server.env.bot.model.constants.props[server.env.bot.model.constants.orgUnitKey].value) == null) {
    queueItem.values.push({
      key: server.env.bot.model.constants.props[server.env.bot.model.constants.orgUnitKey].value,
      value: message[server.env.bot.model.constants.props[server.env.bot.model.constants.orgUnitKey].value]
    })
  }

  //Bind message template values
  for (let x = 0; x < contentKeys.length; x++) {
    if (template.indexOf(contentKeys[x]) > -1) {
      //Count number of available values based on detecting matching ids between the template and the message
      if (queueItem.values.find(item => item.key == contentKeys[x]) == null) {
        queueItem.currentValues += 1
        queueItem.values.push({
          "key": contentKeys[x],
          "value": message[contentKeys[x]]
        })
        queueItem.updated = true;
      }
      else {
        if (queueItem.values.find(item => item.key == contentKeys[x]).value != message[contentKeys[x]]) {
          queueItem.values.find(item => item.key == contentKeys[x]).value = message[contentKeys[x]]
          queueItem.updated = true;
        }
      }
    }
  }

  if (queueItem.updated)
    queueItem.notification = this.draftNotification(template, message)

  return queueItem
}

exports.draftNotification = function (template, contents) {
  let contentKeys = Object.keys(contents);
  let finalDraft = template.replace("V{org_unit_name}", contents.ORG_UNIT_NAME);
  let optionSetOptions = []

  console.log('Original notification payload' + JSON.stringify(contents))

  for (let x = 0; x < contentKeys.length; x++) {
    if (finalDraft.indexOf(contentKeys[x]) > -1) {
      finalDraft = finalDraft.replace(contentKeys[x], lookUp(contents[contentKeys[x]]));
      finalDraft = finalDraft.replace("A{", "")
      finalDraft = finalDraft.replace("}", "")
      finalDraft = finalDraft.replace("#{", "")
    }
  }
  return finalDraft;
};

exports.fetchUserGroup = function (userGroupID) {
  let route =
    server.env.target.endpoints.props[
    server.env.target.endpoints.userGroupSingle
    ];
  let queryUrl = server.env.target.uri + route.path;

  queryUrl = queryUrl.replace(route.placeholder, userGroupID);

  return axios.get(queryUrl);
};

exports.fetchUserByTelegramID = function (telegramID) {
  let route =
    server.env.target.endpoints.props[server.env.target.endpoints.checkUserByTelegramID];
  let queryUrl = server.env.target.uri + route.path;

  queryUrl = queryUrl.replace(route.placeholder, telegramID);

  return axios.get(queryUrl);
};

exports.fetchUser = function (userID) {
  let route =
    server.env.target.endpoints.props[server.env.target.endpoints.userSingle];
  let queryUrl = server.env.target.uri + route.path;

  queryUrl = queryUrl.replace(route.placeholder, userID);

  return axios.get(queryUrl);
};

exports.fetchNotificationTemplate = function (templateID) {
  let route =
    server.env.target.endpoints.props[
    server.env.target.endpoints.notificationTemplate
    ];
  let queryUrl = server.env.target.uri + route.path;

  queryUrl = queryUrl.replace(route.placeholder, templateID);

  return axios.get(queryUrl);
};

exports.registerUser = function (telegramID, userProfile) {

  let route = server.env.target.endpoints.props[server.env.target.endpoints.updateUser];
  let subscribersGroupID = server.env.bot.model.constants.props[server.env.bot.model.constants.subscribersUserGroup].value
  let queryUrl = server.env.target.uri + route.path;
  let payload = JSON.parse(JSON.stringify(userProfile));

  queryUrl = queryUrl.replace(route.placeholder, userProfile.id);
  payload["telegram"] = telegramID

  if (payload.userGroups == null) {
    payload["userGroups"] = [{
      "id": subscribersGroupID
    }]
  }
  else {
    if (payload.userGroups.find(user => user.id == subscribersGroupID) == null) {
      payload.userGroups.push({
        "id": subscribersGroupID
      })
    }
  }

  try {
    axios.put(queryUrl, payload)
      .then(function (data) {
        console.log('Update result : ' + JSON.stringify(data.data))
      })
  }
  catch (error) {
    console.log('Patch error')
  }
};

exports.unregisterUser = function (userSession) {
  let route = server.env.target.endpoints.props[server.env.target.endpoints.updateUser];
  let subscribersGroupID = server.env.bot.model.constants.props[server.env.bot.model.constants.subscribersUserGroup].value
  let queryUrl = server.env.target.uri + route.path;
  let payload = JSON.parse(JSON.stringify(userSession.profile))

  queryUrl = queryUrl.replace(route.placeholder, userSession.profile.id);

  //https://bobbyhadz.com/blog/javascript-array-find-index-of-object-by-property
  let userGrpIndex = payload.userGroups.map(grp => grp.id).indexOf(subscribersGroupID)

  payload.userGroups.splice(userGrpIndex, 1)
  userSession.sessionEnded = true;

  try {
    axios.put(queryUrl, payload)
      .then(function (data) {
        console.log('Update result : ' + JSON.stringify(data.data))
      })
  }
  catch (error) {
    console.log('Patch error')
  }
}
