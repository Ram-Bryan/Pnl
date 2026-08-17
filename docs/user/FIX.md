Dont add "MT5 ticket: ...." when importing a trade
In open orders detail page:
    - "Open" that sits at Pnl level is blue
    - there is no pill Open. Just the text is enough

When importing a trade, always take the csv as source of truth:
    - Idk if you did errors in the imports. I'll assume first that you didnt. If you didnt here are the fixes I want you to check:
      - dont convert the time. Make it as the time shown in the csv. For example, if it shows: 2026-08-05T11:33:26,2026-08-05T11:33:36 in the csv (UTC), then we put as is inside the imported trade
      - open price7 and closing price digits after comma. Make it as shown in the csv. Dont round up. For example, in phone it is shown 157.34. In csv it is 157.536. Make it as 157.536 shown. Same stuff for long numbers such as: 1.34628. HOwever if there are more than 6 numbers (included) after the comma, then dont add it. So basically round up to 6 numbers. BUt it doesnt mean show it as: 157.536000. Its always: 157.536. But if we have 1.1544200000000002 we show it as 1.15442. Same formatting for stop loss and take profit


Investement is shown as $ even tho dispaly or accoutn type is in CEnts. MAke it follow the display. Also, this suggests that investment calcualtion doesnt follow the rule of conversion. Confirm that.

Rounding up too much (as I explained in the previous paragraph) compounds to errors. For example, for my entire month, Pnl shown in MT5 is -53.35 USC. in this app, it shows -55.25 USC. So I want you to do this:
    - Take the csv I told you. And calcaulte yourself. THe calcualtions should lead up to waht MT% disiaply.
    - Correct what needs to be corrected inside this app

Sometimes if the graph has both positive and negative trend (going in both side), the y axis shows 0 0 0 0 0. Fix that. And make sure the graph is pro, And correctly display ups and downs in both parts. which means that we should see an x axis drawn so tha twe know this is the border 0 of ups and downs

in the settings we can add a balance. This balance is the start of our capital. Remember that we started at 0 (For Pnls, for the trend graph, for many stuff). We wont start at 0 anymore but at the balance based on the account type we have saved it, so we have saved it in USD accoutnt eh it will be that, otherwise no. Also add deposit and withdrawl details.
Apart from that, when clicking a day in the month view, it is really slow to switch days. Even tho its just a click and highlight. But I prefer it like that, when clicking a day in whatever week view or month view, or whatever view. When we click a day: the pnl card should show the pnl7