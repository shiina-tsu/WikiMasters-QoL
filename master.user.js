// ==UserScript==
// @name         WikiMasters QoL
// @namespace    http://tampermonkey.net/
// @version      0.1.2
// @description  Enhance wiki-masters experience with quality of life features.
// @updateURL    https://github.com/shiina-tsu/WikiMasters-Qol/raw/main/master.user.js
// @downloadURL  https://github.com/shiina-tsu/WikiMasters-Qol/raw/main/master.user.js
// @author       https://github.com/shiina-tsu
// @match        *://*.wiki-masters.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wiki-masters.com
// @run-at document-end
// @grant        none
// ==/UserScript==

function runPageLogic() {

    (function () 
    {
      if(localStorage.getItem("ShowAll") === null) {
        localStorage.setItem("ShowAll", false);
      }
      if(localStorage.getItem("previousPrices") === null) {
        localStorage.setItem("previousPrices", JSON.stringify({}))
      }
    })();

    const original_Fetch_Function = window.fetch;
    const card_Summary_URL = "https://www.wiki-masters.com/api/marketplace/cards/<CARD_ID_>/sales?scope=summary"
    const cards_Personal_Collection_URL = "https://www.wiki-masters.com/api/my-collection?sort=rarity&page=<PAGE_>&stats=0"
    const supabaseApiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5cnhqZXBwanFzeHhqYXlmcnVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODAzMzksImV4cCI6MjA4OTQ1NjMzOX0.BZluyXygNxuQGDPxFX1zG5i-cqp10CVK-8GGtuak4Rg"
    // supabaseApiKey is not a personal token, same token is used my every user.
    const myself = myGetData() //JSON: id, bearer

    let cards_Personal_Collection_Count;

    function myGetData()
    {
      const authTokenBs64p1 = document.cookie.split("sb-cyrxjeppjqsxxjayfrur-auth-token.0=")[1]
                                         .split(";")[0].replace("base64-", "").trim();
      const authTokenBs64p2 = document.cookie.split("sb-cyrxjeppjqsxxjayfrur-auth-token.1=")[1]
                                         .split(";")[0].trim();
      let authTokenBs64 = authTokenBs64p1 + authTokenBs64p2
      while (authTokenBs64.length % 4) {
        authTokenBs64 += '=';
      }
      const decodedData = JSON.parse(atob(authTokenBs64));
      return {"id": decodedData.user.id, "bearer": decodedData.access_token}
    }

    async function requestFetch(request) 
    {
      try {
        const response = await original_Fetch_Function(request);
        if (!response.ok) {
          throw new Error(`Response Status : ${response.status}`);
        }
        const data = await response.json();
        return data;
      } catch (error) {
        throw new Error(`${error}`);
      }
    }

    function waitForElements(check, timeout = 10000)
    {  /* function made with help of AI */
      return new Promise((resolve, reject) => {
        function isFound(result) {
          if (!result) return false;
          if ('length' in result) return result.length > 0; // Works with multiple element 
          return true;
        }

        const existing = check();
        if (isFound(existing)) {
          resolve(existing);
          return;
        }

        const observer = new MutationObserver(() => {
          const el = check();
          if (isFound(el)) {
            observer.disconnect();
            resolve(el);
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
          observer.disconnect();
          reject(new Error("Timed out waiting for element"));
        }, timeout);
      });
    }

    // function getElementsByPartialText(type, text) {
    //   return Array.from(document.querySelectorAll(type)).filter((el) =>
    //     el.textContent.trim().startsWith(text)
    //   );
    // }

    async function getPrice(cards)
    {
      const els = Array.from(
        await waitForElements(
          () => document.querySelectorAll('div[class="absolute top-[45%] left-0 right-0 bottom-0 flex min-h-0 flex-col p-3 z-20"]')
          )
        )
      let previousPrices = JSON.parse(localStorage.getItem("previousPrices"));
      let prices = []

      function findCardElement(title, desc)
      {
        for(const el of els){
            if (!el.classList.contains("injected") 
              && el.querySelector("h3").textContent === title
              && (el.querySelector("p")?.textContent === desc || !el.querySelector("p"))
            ) {
              return el;
            }
        }
        return undefined
      }
      function insert()
      {
        prices.forEach((card) => {
          const {title, desc, price} = card;
          const el = findCardElement(title, desc);
          if (!el) return;

          waitForElements(() => el.querySelector('div[class="flex w-full shrink-0 items-center justify-between border-t border-black/20 pt-1 py-1 justify-between"]').firstElementChild)
          .then((div) => {
            div.insertAdjacentHTML("afterend", `<div class="text-[10px] flex items-center justify-center gap-1 "><svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 1 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M7.5 8.5 9.5 15.5 12 10 14.5 15.5 16.5 8.5"></path></svg><span class="font-bold text-black/90">${price}</span></div>`);
          })
          el.classList.add("injected");
        })
      }
      async function price(card)
      {
        const time = new Date().getTime();
        const title = card.card.wikipedia_title
        const rarity = card.card.rarity
        const desc = card.card.category
        let price;

        if((time - previousPrices[card.card_id]?.lastChecked) / (86400000) < 1) {
          price = previousPrices[card.card_id].price
        }
        else {
          const priceData = await requestFetch(card_Summary_URL.replace("<CARD_ID_>", card.card_id));
          price = priceData.summary[rarity]?.average

          if(!price) price = "?";
           
          previousPrices[card.card_id] = {price: price, lastChecked: time};
        }
        prices.push({"title": title, "desc": desc, "price": price})
      }

      (async () => 
      {
        await Promise.all(cards.map((card) => price(card)));
        localStorage.setItem("previousPrices", JSON.stringify(previousPrices));
        insert()
      })();

    };

    async function setupTrades(trades)
    {
      let received = []
      let sent = []
      const els = await waitForElements(() => document.querySelector('div[class="space-y-3 animate-fade-in-up"]'))
      
      for(let i = 0; i < trades.length; i++)
      {
        if(trades[i].status == "pending")
        {
          if(trades[i].initiator_id != myself.id) received.push(i)
          else sent.push(i)
        }
      }

      for(let i = 0; i < els.childElementCount; i++)
      {
        const btn = els.children[i].querySelectorAll('button[type="button"]')[0];
        btn.addEventListener("click", () => {
          console.log(received)
          getPrice(trades[received[i]].items)
        })
      }
    };

    window.fetch = async function (...args) {
        function forwardResp(response, modifiedData)
        {
            // Build a new Response object to return instead
            return new Response(JSON.stringify(modifiedData), {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        }

        const [resource, config] = args;

        const url = typeof resource === 'string' ? resource : resource.url;


        // Real fetch
        const response = await original_Fetch_Function.apply(this, args);

        // Leave original untouched
        const clone = response.clone();
        const data = await clone.json(); // or .text()

        // Modify the data
        const modifiedData = { ...data };

        if (url.includes("/api/marketplace?page=")){
            getPrice(modifiedData.auctions);
        } 
        else if (url.includes("/collection?page="))
        {
          getPrice(modifiedData.collection)
        } 
        // else if (url.includes("/cards?page=") && document.location.pathname === "/global-collection")
        // {
        //   getPrice(modifiedData.cards)
        // }
        else if (url == "/api/trades")
        {
          setupTrades(modifiedData.trades)
        }
        else if (url.includes("/api/my-collection?sort=") 
          && (window.location.pathname.includes("/collection") 
            || window.location.pathname.includes("/marketplace") 
            || window.location.pathname.includes("/trades"))
          )
        {
            if(localStorage.getItem("ShowAll") == "true"){
                let lastResp = modifiedData
                let page = 1
                while (lastResp.collection.length != 0) {
                  lastResp = await requestFetch(cards_Personal_Collection_URL.replace("?sort", "?ShowAll=true&sort").replace("<PAGE_>", page.toString()))
                  modifiedData.collection.push(...lastResp.collection)
                  page += 1
                }
                CardsCollectionNumbers = modifiedData.collection.length;
                return forwardResp(response, modifiedData)
              };

            getPrice(modifiedData.collection);
        };

        return response;
    };

    async function auctionAddProfile()
    { /* During auction clicking on bider/seller name redirect to their profile. */
      const spanClasses = ["text-[var(--color-foreground)]/80", "text-[var(--color-accent)] font-medium", "text-[var(--color-foreground)]/80 font-medium"]
      // spanClasses = biders, seller, leader
      spanClasses.forEach((spanClass) => {
        waitForElements(() => document.querySelectorAll('span[class="'+spanClass+'"]')).then( (els) => {
          els.forEach((el) => { // el is span with name of the user for innerHTML
            const a = document.createElement('a')
            a.href = "/profile/"+ encodeURI(el.innerHTML)
            a.innerHTML = el.innerHTML
            a.classList = el.classList
            el.replaceWith(a)
          })
        })
      })
    }

    if (window.location.pathname.startsWith("/marketplace/")) 
    {
        auctionAddProfile()
    } 
    else if (window.location.pathname === '/collection')
    {
        waitForElements(
          () => document.querySelectorAll('div[class="flex items-center justify-center gap-2 py-3"]'),
          9999999
          ).then(
          (els) => {
            els.forEach((el) => {
              el.firstElementChild.insertAdjacentHTML("beforebegin", '<button type="button" class="ALL-injected px-4 py-2 rounded-lg bg-[var(--color-surface-light)] text-sm disabled:opacity-30 hover:bg-[var(--color-accent)]/10 transition-all cursor-pointer disabled:cursor-not-allowed">Show All</button>')
              if(localStorage.getItem("ShowAll") == 'true'){
                el.querySelector(".ALL-injected").style.color = "green";
                let btns = el.querySelectorAll("button:not(.ALL-injected)")
                btns.forEach((btn) => btn.remove());
                el.querySelector("span").innerHTML = CardsCollectionNumbers.toString() + " Cards";
              }
            })
          });
              
      waitForElements(
        () => document.querySelectorAll(".ALL-injected"),
        9999999
      ).then( 
        (btns) => {
          btns.forEach((btn) => btn.addEventListener('click', () => {
            localStorage.setItem("ShowAll", localStorage.getItem("ShowAll") !== "true");
            document.location = document.location;
          }))
        });
   };
}

(function () {
  'use strict';
  /*  Function By AI, this function is needed because the site works differently,
      making path change not actually rerunning the script */
  
  let lastPath = location.pathname;

  function onRouteChange() {
    console.log("Route changed to:", location.pathname);
    // re-run whatever logic depends on the current page
    runPageLogic();
  }

  // Patch pushState and replaceState to catch programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event('locationchange'));
  };

  // Catch back/forward browser navigation too
  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('locationchange'));
  });

  // Listen for our custom event
  window.addEventListener('locationchange', () => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      onRouteChange();
    }
  });

  // Run once on initial load too
  runPageLogic();
})();