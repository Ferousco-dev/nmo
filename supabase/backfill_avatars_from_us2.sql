-- us2.json yielded 530 unique handles with avatars
-- matches against us2.json: 130
-- misses (not in us2.json): 255

-- =====================================================
-- Generated UPDATE — backfills display_name + avatar_url
-- from us2.json for matching handles only. Idempotent.
-- =====================================================

update public.nmo_members p
set
  display_name = coalesce(p.display_name, v.display_name),
  avatar_url   = v.avatar_url,
  last_seen_at = now()
from (values
  ('chang-nick-6905', 'Chang Nick', 'https://assets.skool.com/f/84c9907314af4108876557f2835790b7/3ba2ca96b56e4fb8bd29e81b169384c109490ced272d4fba9cfc7e94a8392cc7-sm.jpg'),
  ('94408989', '康 博淳', 'https://assets.skool.com/f/32102e90863544e2a097764d535d338c/760e5b56ba8545a1956f44c12ea6e6c46e8186ad822941f18c3d80456811550f-sm.jpg'),
  ('guo-noch-9268', 'Guo Noch', 'https://assets.skool.com/f/b2f627ed51234873baa91b308bc1e980/686692b38b5847eb99a5336b4782880fd6761cf401f04c9fafa4685b0a0b607a-sm.jpg'),
  ('85048141', '楊 振舜', 'https://assets.skool.com/f/231a41bf679a4a008e9cb928e78fb9c1/c45aaf492fea4fd8b4fed498051406df4a2c40eabeb94f878247bfe2a1ee7185-sm.jpg'),
  ('chris-wang-1158', 'Chris Wang', 'https://assets.skool.com/f/b161026ae04d44278532a28c667d7317/4f175dfdbafe429da985bd93e47ad1aa1c8816fe3c0a4787a218a6ef23a367df-sm.jpg'),
  ('11964560', 'Bruce Tseng🔥', 'https://assets.skool.com/f/5bc0d2a0bae04b7695c4c8695e2e668c/1defd9d4a61849dc8fb9bb4bf3b1927bb67c210550e840cd86fd7ebc23a1d776-sm.jpg'),
  ('18794392', 'How Zheng', 'https://assets.skool.com/f/061eea8ac4024ab286a600dc93bec3c6/474814346fb848efb704d57cada4061c7dfb1e15dc3c481ba30d8ffc8c6c8b99-sm.jpg'),
  ('timoris-huang-9936', 'Timoris Huang', 'https://assets.skool.com/f/7a7b054cd8be425ea5a0af73b7e1e4ec/52cc167d7b104219a25ca3877af6e977347bb5ba1173439a964ce7bf1e9ad094-sm.jpg'),
  ('chung-yuning-8528', 'Chung Yuning🔥', 'https://assets.skool.com/f/d1e65a0fe16c4d6a9c29be9c1285ee56/cdf041a7059945508fb2b4ccc550c1e0befa15655b4146999a37139a6cae0f91-sm.jpg'),
  ('eugene-chuang-7231', 'Eugene Chuang', 'https://assets.skool.com/f/3208aa8a76c742d595ec71342636545d/1880ade572784b008b4f71e5dd34b92f59325359af7047498d534e1eb8f871f3-sm.jpg'),
  ('yu-archer-6783', 'Yu Archer', 'https://assets.skool.com/f/564a6a003c4d496893eae48e01c35447/fe499d4a4fd14c11911c8e3290d6d3260fa4ed235015411e8a07c1800fe081d6-sm.jpg'),
  ('yu-jhen-huang-7291', 'Yu Jhen Huang', 'https://assets.skool.com/f/670bf10797934ccd8bea36bb5a2b58eb/793b851f57e54120af69b4b76b06dc050555a2cd16c2487e841ea7427cef83f7-sm.jpg'),
  ('yu-adam-2575', 'Yu Adam', 'https://assets.skool.com/f/8d06b194ef3e4702aa231b1965faf40f/4bc300d172d34dd184ad4cdcde1a3cb03ef55e79c2544ea5893c4c3ca6a96234-sm.jpg'),
  ('86241688', '祥祐 黃', 'https://assets.skool.com/f/b1a4c59174ec4f78ad03212b1b158866/aaedba76f27b46ba935de6ef76a520a11a5696a5df224aa0905e33f5c6e28db5-sm.jpg'),
  ('su-frank-6262', 'Su Frank', 'https://assets.skool.com/f/4110de12dec648078e28e662143cdd12/5bebeb4732fc4ff7a791757fc2d917e8faa4b0a0cf6e406eab58982ad9f7595a-sm.jpg'),
  ('tin-li-5207', 'Tin Li', 'https://assets.skool.com/f/a9c8bc9f044d441eb082af543abc9afb/0ad8b26315594303a5be8f640bb3359b9db59de7578742db910d6e8e132b3aca-sm.jpg'),
  ('scott-jing-4685', 'Scott Jing', 'https://assets.skool.com/f/341195db297f450498276621ee3370d3/954323ef12844628b7664bc24ae47d629ea58f01f6374fba8ca4349ab256d0bd-sm.jpg'),
  ('parker-huang-9495', 'Parker Huang', 'https://assets.skool.com/f/5cad475c2e1644179e69b79516dd38b1/8897677625d0414a8353cb6a934891d2fdbfe3a66bc54048ae2cac9bb4fd114d-sm.jpg'),
  ('20432420', 'J W', 'https://assets.skool.com/f/6190a70746184a689bb3a032a77e31c3/b8ff6e2e534c4f78bdb0956f9b910218d6309cb64f6a47699cf99128096dd719-sm.jpg'),
  ('lin-han-9394', 'Lin Han', 'https://assets.skool.com/f/3d5d2a8996184b5ea3b1d24982788db8/8a4ab8e66b554830ab0fdadde7fae5221ff5853cd80645268db9fe2c3b5368f9-sm.jpg'),
  ('johnny-chen-5778', 'Johnny Chen', 'https://assets.skool.com/f/f0d4375d6bac4c7b95601ac0efb32c7f/27f0eac1bf074a81a74ffa268fab097a27f573ef9778481e85b809db33d58574-sm.jpg'),
  ('jerry-chung-7730', 'Jerry Chung', 'https://assets.skool.com/f/7605d83bbd14480b95397d0489766c65/8e1d8f6ba56c448ebdc1a14f0e507fc37b0b14caff514708989d24eac7cba80b-sm.jpg'),
  ('jack-liu-9368', 'Jack Liu🚀⭐', 'https://assets.skool.com/f/4d8844727da4477b8b17f919ac7cae70/12a617952af04d8b86301539cd377e3d5fd0987dc00844eda2b966d91ec3c6e2-sm.jpg'),
  ('jerry-chi-6082', 'Jerry Chi', 'https://assets.skool.com/f/eebaa924f5b94c40bfed588e8e652d1f/2d5a902e8d8a43f7ae6182c0d0fd464f88c06c165d9a423f86c4255f658a7555-sm.jpg'),
  ('32916815', '昭傑 王', 'https://assets.skool.com/f/a33dabb0516144fcbb6edbf0d8a0e0c6/3bf679a91c604ad0b6b71e4a34d5403b0077738e57d34014b4cfd6502eeea9f5-sm.jpg'),
  ('atom12327', 'Hsi Rui Wei', 'https://assets.skool.com/f/e173b381ba744e259ccf75b4861ff626/683fa22d7cf04cb699d25035798f6347b46c80419e1448adaebc5105a688fc99-sm.jpg'),
  ('aaron-5177', 'Aaron 子儀', 'https://assets.skool.com/f/4b64662fcb2945faa469d2de61ab47b8/b42d991d6a3b4371b1ed2bd9253d35bedd6de9f58ace443185dbf6975e5230ec-sm.jpg'),
  ('74564560', 'Hamilton Lee', 'https://assets.skool.com/f/67d1e33e49994e708fcc8ca2f61a003a/644a39a08ac14921841010a27e4aa68da812cd29035844a4bb76341831adb737-sm.jpg'),
  ('66855712', '吳 政霖', 'https://assets.skool.com/f/05d94bd0b3b944908b829da83863331c/7e9eec4d7a734032a3bb9fadb9b5d63fccebb85d488347d5ae4b465b50cfc27b-sm.jpg'),
  ('chen-cheng-5433', 'Chen Cheng', 'https://assets.skool.com/f/b977d3770ea643f1b339da12ff81c2e4/affc06607b5b4bd59f57a06c55be0be4a5916178a65e44dea21c0a2d9cac4a9d-sm.jpg'),
  ('85835288', '蔡 易鑫', 'https://assets.skool.com/f/8e7a1a7d650944eca5d79938f9919b0b/9383e71173354dd591d1429b3c4ba6b5b557195a43e84041b83e6b0ea6ff5588-sm.jpg'),
  ('niko-liu-4484', 'Niko Liu', 'https://assets.skool.com/f/91d05ae3cb024b2d8cee03793e1e0841/29db63c7dfe14a528e299a333ab3e88393fc1ae97b824b5f9d5a1ad348edf56d-sm.jpg'),
  ('97139389', 'R On', 'https://assets.skool.com/f/cbf8c319cd45405e83dd79f3aa8ce06f/915aaa0ae30547608ff4bab2bdc15cd65af3c25541204cbaadb0d0b758bb558d.jpg'),
  ('bing-chiu-1772', 'Bing Chiu', 'https://assets.skool.com/f/7d41993a7588459a9cd0160e85175490/0a5fd31ba99e4cac8a8551a72a807b3912c73a430f424ebea4787a70f515623d-sm.jpg'),
  ('82664204', '鄭 馭帆', 'https://assets.skool.com/f/edbc5392632a4b65a3ab1321fb3092d6/bfd42c5e8c8b401a83dc73b4e680081be4745a32260944fbb6589e07d628a978-sm.jpg'),
  ('99091039', 'Youfeng Xie', 'https://assets.skool.com/f/14b13f98d42845a78c4fc6d8c8ba969f/3d54802036664f0a852ef756dbaa6f6a3687839decd34b86bf7e29acc2e65fe8-sm.jpg'),
  ('wei-ching-wu-9196', 'Johnny Wu', 'https://assets.skool.com/f/ffbd83f19ef54864bb4dbb90ad9e93ca/a306275bb2204a28bff9544a9ed4a21ace2c61b3eac940739e7fae23a738abda-sm.jpg'),
  ('78345425', 'Alpha C', 'https://assets.skool.com/f/67363ce5a0b6401cafb955fe0bbcc850/8217eb9c569f4d50a17e50a92a8c1d0b7dc3c71028414a3aac54efe598dc9aeb-sm.jpg'),
  ('luo-wang-1274', 'Luo Wang', 'https://assets.skool.com/f/bdef1d81e0a14d6c92bbde9cebbf5d24/f79439b95aa443829bdb7b180e4f7b85142ff77a0b00446da57d74e97d83582e-sm.jpg'),
  ('wyatt-tse-5447', 'Wyatt Tse', 'https://assets.skool.com/f/a0f239a6fdca4a088d0f5b3ec9e94a3d/2664ab9e88354be99cbd473ffcd76125b725d50d8a414a5c8091512e0580f2f5-sm.jpg'),
  ('charlie-lin-8012', 'Charlie Lin', 'https://assets.skool.com/f/f5cb1650fc904899b3229f9c029480b3/1aae971f76ef420aaf127d3c5d3204b5a2361537d4684089b18efbf6589677d2-sm.jpg'),
  ('chen-ryan-5958', 'Chen Ryan', 'https://assets.skool.com/f/8ce9541271fc4fa48880efefc320b806/af992469df3543bab2e67cb14e5f3e37f41f0e99a8084875bf501d48b56caa66-sm.jpg'),
  ('liu-peter-8501', 'Liu Peter', 'https://assets.skool.com/f/4dfa41734a34482eb70ba020812ee96e/30820e297bd047b7be69927a4acfb1ea0a9c5afca23e40b8a5d88ebb1d064431-sm.jpg'),
  ('koy-kingboon-6471', 'Koy Kingboon', 'https://assets.skool.com/f/364f3d7523674652afd1c34e308c7a05/dcc9585b50c54199852c759cf12e852f0aeeceade28a4eae99cec49e47791538-sm.jpg'),
  ('69727139', '顏 宏達', 'https://assets.skool.com/f/188a23466e954e1b88c5036910ca51d6/de1f1a36b6cb413f82f066faac8b02f712f954e1505c4813adbaea545d83348c'),
  ('luke-ding-9824', 'Luke Ding', 'https://assets.skool.com/f/6724469d34224758a23f236ab958efbe/d769e33a33414681bdd81752f0dbcc42d01849e2a16745a8b4e4e3a420fa2285-sm.jpg'),
  ('74720688', 'K K', 'https://assets.skool.com/f/25e206cfef484e2c824baa8943555a94/d4edd99fb870434c9d4d951caa319aa3c383866863bd4ee9ad7a5798110c1a0d-sm.jpg'),
  ('dj-lin-8504', 'William Lin', 'https://assets.skool.com/f/ae705d3d94454837b7c61f1492b4cda7/ca4b9e3bc8514f2abb903aaa28393cd98e108004cffd481bbcc66a75f21f737a-sm.jpg'),
  ('tissue-paper-4354', 'Tissue Paper', 'https://assets.skool.com/f/b400cdb391fc4a9488dc3ce345880573/1d92560d7366424995bfd0b57462dd0af600a77aa6cf415e818d9c4958c1d461-sm.jpg'),
  ('73242512', '慶揚 王', 'https://assets.skool.com/f/f0e60a635cea48e587082d65b75cb8ed/4a626a5a0ac1441f8cd85d05b552e9a59e795c30e0de46ffba4d14c820ff4aeb-sm.jpg'),
  ('david-hsu-9017', 'David Hsu', 'https://assets.skool.com/f/4496dac018884c549ca7a326329bde93/57caa2d201294f1b98554e095ec4454b9771d63fd6b44dec9626e8d906559210-sm.jpg'),
  ('huang-wei-ming-2602', '黃韋銘 Huang, wei-ming', 'https://assets.skool.com/f/1278c87ec3224f6595d4dd22609d365e/a013958dbb2a40d39f0c3b4960aa20d51c8239f889ab45148da075ca39041a69'),
  ('kunghao-ho-3271', 'KungHao Ho', 'https://assets.skool.com/f/ad8b88137ec34d6dbe96c2f82ccd1d07/12552039691e41a59f9adc40c28311645bfbbfae08a246959c7d4a132ef8da84-sm.jpg'),
  ('24804795', '湯 建軒', 'https://assets.skool.com/f/a16c7ede2ad5445fbb10fe415084038a/b58c0447ba0145e38f1a1802d3637f555a3f1da65e304750b04c1e66d583d94c-sm.jpg'),
  ('shawn-yang-2499', 'Shawn Yang', 'https://assets.skool.com/f/be7fce0a007140538bbb7597e7d68a23/4cdfc89cf9c148baafd876c954b0d4388961a203f069447782e4ac76d992a3f7-sm.jpg'),
  ('rui-chen-7617', 'Rui Chen', 'https://assets.skool.com/f/f18351929acc484fa981527723914bd8/7ab8be144f544721a91d388466030ae329fdcd10cd1c498c8a9199ad147b068f-sm.jpg'),
  ('nicky-lin-9818', 'Noah Lin', 'https://assets.skool.com/f/45a25f5aadf849c4bcc254652a8c497a/64e5f16c5d8548189fe9bda04c58553cb28bea59637242a7941971b1373d0018-sm.jpg'),
  ('17942728', 'York Chen', 'https://assets.skool.com/f/16a80040fbc04178aa5ff2b8335a7116/51b6e200573a4082979565626f10d69229beaf9b9f01423c9d85aa8713e72d4e-sm.jpg'),
  ('ryan-chen-7529', 'Ryan Chen', 'https://assets.skool.com/f/3cd41f3d06f84f41a0bc9597c1a139b5/4e0a0cf44718451ca68c9442c0ed22f3d192654696704d748ce6f840f65ee62e-sm.jpg'),
  ('56447597', 'Mark Chue', 'https://assets.skool.com/f/579c3662db874caf8327b64140a94690/7892b403fb004de2b5043c9ec1353bf59441903ca3e547df8caa84320467d7ac-sm.jpg'),
  ('eric-cheung-3225', 'Eric Cheung', 'https://assets.skool.com/f/0484575298804986bae873d52f91bc39/d08e460bf9ed4071a9e481d8f87fb0aba596d9c680bf4b53824e93cb7e206f00-sm.jpg'),
  ('andy-kuo-8409', 'Andy Kuo', 'https://assets.skool.com/f/67942233b3f540f0a750038c36effa7b/97117a49a71c4e42b98e57f5f5e76ec796c44f9e0899452a832964eea2fc5795-sm.jpg'),
  ('chen-qihan-9185', 'Chen Qihan', 'https://assets.skool.com/f/3cc3c00e7fe84071a051aa6a50617758/b492e8f43c0b42d49ee8a1ade68ee776c5aad6c835e3400fb00d23867d085b16-sm.jpg'),
  ('jackie-xu-4085', 'Jackie Xu', 'https://assets.skool.com/f/7e4425ba04f9499c916ccfe2189a28fb/ba384ca55fe340db83324a8c89b059b71d8bb5e284a94977a28a2f4ab32c9d80-sm.jpg'),
  ('88424908', '黃 俊喬', 'https://assets.skool.com/f/ebfa6581d18f4314b5f74bf9c85dc08f/6e4db5b395ea44518f81d343bbbc53fce7ea42eee48d444db8843b2c61bd30d9-sm.jpg'),
  ('46377929', '郁軒 簡', 'https://assets.skool.com/f/b721c7bf47ee4d7f82bc92f6834be232/f08ea5aefc58481a802a472fd7771e4ec516e6ac3cb746928fc1100806d4730f'),
  ('liu-rr-9443', 'Liu Sylen', 'https://assets.skool.com/f/b4773f97a2a84b18a42fd52620b905da/1b33bf2bb29b4b7286d32829be69c7fc6c71f2cdc2314340a08dd8eda1b2e563-sm.jpg'),
  ('26897528', '博鈞 張', 'https://assets.skool.com/f/b130951e41ca465b93f313c68d97d47b/42a97912056a41acbc1bcbc1ed9b884af1a6d7eed1a24e2d9fa0257a2014dbe4-sm.jpg'),
  ('paul-liu-1542', 'Paul Liu', 'https://assets.skool.com/f/5b9fb28cce3a460f904ed6665fedc2e8/c2c97bc71fce45499a495f4661831c4bdba16a2dac3648f1908747955061ca53-sm.jpg'),
  ('chian-yang-6470', 'Chian Yang', 'https://assets.skool.com/f/e3704bcfae7541fc8349c0e2cb9b568d/449cacd962164cd6a93a7a464490c2019f290d3686e94f6d9ad688f8b9d027c1-sm.jpg'),
  ('timons-chai-7891', 'Timons Chai', 'https://assets.skool.com/f/e020d7280b6241c38862a2467b16e595/0cf16316d994415bbca80102ad0daabd522ca6c96bbd4bd48748be1a7dde232e-sm.jpg'),
  ('68131078', '陳 玠豪', 'https://assets.skool.com/f/9681fc42a1ba401f9319a32e5955e334/8b7e24e8a4c94375b648057f5425f485c98cbbfdf0c4456b98604181a9533bc7-sm.jpg'),
  ('jeff-ding-8446', 'Jeff Ding', 'https://assets.skool.com/f/6270f433d0be401fbcfdd55709dc3274/ef8e95f99ffb441ab18dc8dd6aeb4caf2de505e0ab0943dd804d5be5dba4d1bc-sm.jpg'),
  ('wilson-jiang-1288', 'Wilson Jiang', 'https://assets.skool.com/f/25e2122f1f454dda9d64634e026852dd/7253890435c44e478ed53d42ebc9e3cbab5151b3c4684668a56fa66fa75a42f6-sm.jpg'),
  ('alexander-huang-8507', 'Alexander Huang', 'https://assets.skool.com/f/c1520704062b45339c60bbb5401a1aab/e0c005e49774428795c5f8108bab8fcebc6685b8ce644b419ed45f6199daedb1-sm.jpg'),
  ('tzu-chi-kuo-4823', 'Tzu Chi Kuo', 'https://assets.skool.com/f/d3fe580f2b5146afae81ea12d9424bee/c0b204888fae46adbefdcae691bd3f7ee3dbba678abd41ecaf9ed89ec36d44be-sm.jpg'),
  ('sam-shih-4347', 'Sam Shih', 'https://assets.skool.com/f/f492ae2a1d7b4256b92be2b7e781cf12/b6c67dd321974d17bbcf82b2eacd264df5b139869e0e443c86fffb1e17bab243-sm.jpg'),
  ('chris-guan-8072', 'Chris Guan', 'https://assets.skool.com/f/c3bba6f253e24d2285d0c8cd97d3c3c4/afa07ae663ed4f71a0bb36919acad70f58d3ba9d15a5417883e9e84b4ef3e7f3-sm.jpg'),
  ('maxim-choi-9293', 'Maxim Choi', 'https://assets.skool.com/f/749a2c9ac26e4efcab80c29368794f37/4941fda85d034414ba851bb775bc85c7b1385c6850544df88ef9256d7bf4b998-sm.jpg'),
  ('76104908', 'Johnny Johnny', 'https://assets.skool.com/f/322567b76d0849f88532f4a61b6cd6a9/9bd811217eb84bd095c4e55039c264d8f874553c9ab9445b9b9929ea5d1795cb-sm.jpg'),
  ('max-chen-5615', 'Max Chen', 'https://assets.skool.com/f/41ca2a920bab4e8c9b86c164022f672a/e09167a7edf746f9ad7d33e2f84211d2111ac33cae7a466e82e371e81a21d72b-sm.jpg'),
  ('lok-l-4437', 'Leo L', 'https://assets.skool.com/f/6c5539b601d947f58e0b7a0ba461f7af/42b84f5f2e5b4cac903f11381fa1655452e7494f0b6f4afea05789565ad0275e-sm.jpg'),
  ('wei-lee-6397', 'Wei Lee', 'https://assets.skool.com/f/84b376b37d7a45dfb04ecb763c101f48/6d6cac56ce784bbeb4ab64b2233df9e629d7053c7e594efb8355fc10402214fc-sm.jpg'),
  ('powei-yi-4087', 'Powei Yi', 'https://assets.skool.com/f/94a14929124f44a0b80e4c3c318c972f/5a7e1c34bbef4718891e8c9504fba3663f1809f95c6d41a6a5c182c8a19f9ed1-sm.jpg'),
  ('95931599', 'Jack Wang', 'https://assets.skool.com/f/9bc8a51ba62140e28d140c55fe1b728a/191c76277e8f4949a410bb4938bb27762b267333c1f44930a74b983666429ea7-sm.jpg'),
  ('ken-wang-4344', 'Ken Wang', 'https://assets.skool.com/f/4634e8c622ac4518b046f5c7cd36ed18/5813b9a4b5404814aa414df20de541a79783822baa594ba5828be147a0871045'),
  ('ben-liu-2195', 'Ben Liu', 'https://assets.skool.com/f/88331e2f443d48bebf3234d48553462a/e669f0769bfe4913b85f1d18ba62cf99f6cd400828f44345b5a29906a3f85aee-sm.jpg'),
  ('yang-lin-7264', 'Yang Lin', 'https://assets.skool.com/f/fecc2a6c5ca74211898069d75e3a7793/a56a01d5a4564a7fa173e2c98813b7a685cd22ba6a3e4b4590b05c94c48648cd'),
  ('59867013', '郑 Qc', 'https://assets.skool.com/f/f401705a924041c68953b578d4cbb6b1/87838eeddbbd48aeaf917c949f00c6b22c8e931949fa4756bd4fc897bdbdcd74-sm.jpg'),
  ('orgil-d-8931', 'Orgil D', 'https://assets.skool.com/f/987ec92b300e45938c46faeef0e1568b/01267fdf5d28482eb5fcf5b37f929c6e841a0acb2cb442408a1ab0a2904098a0-sm.jpg'),
  ('50027566', '蘇 詳崴', 'https://assets.skool.com/f/2e09e10f50204414858f24cd605d6c32/f29a7330329c41caa8b4d29e853ab8726e6af36913df46c3be6e0310cb1eaed2-sm.jpg'),
  ('70227495', 'J L', 'https://assets.skool.com/f/5a42e86d315b486fb79d704d867cefe2/41e37ce052224d6f87eafc6efbd8cf17385dcf4c69ab4cf0815a615a22c2a3e9-sm.jpg'),
  ('sairen-lee-2769', 'Aaron T', 'https://assets.skool.com/f/cc7997cf60c844c080c19c7709617b53/9ed5faf7f1c4477e88bf3c9eb31f10cc158ca02ca71649b58bffda7964874704-sm.jpg'),
  ('79526944', '上賢 楊', 'https://assets.skool.com/f/e91f3ac914be45b3a23f9d02104037f7/b67a0881d4874048a7da3d5c4c5dbd71c96dc07916b947c5b4bb8f6cfa3d78ab-sm.jpg'),
  ('liu-yanting-8833', 'Liu Peter', 'https://assets.skool.com/f/633a59b91af04cdf86de9e7932d2b289/aaba99f135994f3d97f88295f27ed91a01d037f65d7440348dcf4d21c9c3a36f-sm.jpg'),
  ('chingpin-chiu-4042', 'Chingpin Chiu', 'https://assets.skool.com/f/340b3e7b6a0f4b49bbc338159109fb61/46f67b3d8d90434b81c088df1d5605c29e0ea2479f0c4b9fa98f6dba25ae4fb4-sm.jpg'),
  ('zong-qi-wu-2041', 'Zong-QI Wu', 'https://assets.skool.com/f/8b3c5180548a4f5abefab275049ed866/34588f517bdc445f9652f2910e4213f4ee2248f4a6234b17b3904a4e0028082c-sm.jpg'),
  ('ari-tong-3252', 'Ari Tong', 'https://assets.skool.com/f/cd06b9f867fc48bab23f87a6a06732da/152453bd0a9246bf8c21785dda2656fcc989d00807e74616a7788fc9bd0a210c-sm.jpg'),
  ('benny-pan-2882', 'Benny Pan', 'https://assets.skool.com/f/65f31c3d25f84553ac1710af2f82e974/2a8cdac19c764e7f8b4f4661db8f635560adf23b14684b02a8d952501a456035-sm.jpg'),
  ('andy-hui-1750', 'Andy Heiyolo', 'https://assets.skool.com/f/7487176215e746699da2a66cb0c57d11/a074dd8ce9ac46c9bc26d4c63d8adc2e51fd4ca15a944691815ac8da8ab56392-sm.jpg'),
  ('michael-philip-6044', 'Michael Philip', 'https://assets.skool.com/f/1a4e0402ada84120b21079b898ab409c/8592bf17881d4c819e3534ce7e83a140ef12db33bffa4a1d9953d210c317cc72-sm.jpg'),
  ('69953896', 'Hsieh Ting Lun', 'https://assets.skool.com/f/a3ce816370304b20a861b37492dc5cdd/840a38c34d3f4dfbbed60bb16dc329f3c029e3e26da44c509ab8988df6a28ab2-sm.jpg'),
  ('daniel-lee-3921', 'Daniel Lee', 'https://assets.skool.com/f/6a2e32ad90d143db9e3342795997bff6/e6af6a3411d145ff8c9c3633bd9cf8e4b49e8bee9bcb42d99d03d8a425338aed-sm.jpg'),
  ('alex-peng-4670', 'Alex Peng', 'https://assets.skool.com/f/0844f4fcac92414c8511e8053703c3c4/9f800c57a65540d4bec0e35ccdf58a0e7d40f3ce650e4427bf49c2ac50dabece-sm.jpg'),
  ('39154533', '李 晉圖', 'https://assets.skool.com/f/7da2a4312d7d4b409fab4729f488db9a/3d40fc56c3044ed69b088b7fdd4adba9a7d77220b2044c1aa0e70d97149e7359-sm.jpg'),
  ('matt-hsu-9950', 'Matt Hsu', 'https://assets.skool.com/f/21492f9cba5e4ea389c81df5835a6567/e187eaced7344dbd9c1bb2b9a6755f76091af2b7bb08408abe635c926041217f'),
  ('scott-you-2451', 'Scott You', 'https://assets.skool.com/f/a58127251b214993ad62fce989a1ce22/ad97930c831b4c4ca45a78837bd6b836ad6d3663a16048759e731d2265456757-sm.jpg'),
  ('chen-allen-3901', 'Chen Allen', 'https://assets.skool.com/f/a7f9fbb52669465a82f04ebfc39df82a/20be2c197a4c4547a014c00a8d96b0ce026e917dfcf748bc9500ff0589ee7c8e-sm.jpg'),
  ('pak-hei-cheung-4033', 'Pak Hei Cheung', 'https://assets.skool.com/f/cb55530efdd44e08919566bf883f8587/a607ab1d82044ca3ac93428dea0b33b40a0d42137e4a40ee985db94573203306-sm.jpg'),
  ('john-chang-7009', 'John Chang', 'https://assets.skool.com/f/67880f02ad614f2e98bba82f0efec8d8/0b01ed6632a546b9b1a6425a233bc62a2333574a57ef44ad8241a7e4b6b46425-sm.jpg'),
  ('ye-ying-fa-3572', 'Ye Ying-Fa', 'https://assets.skool.com/f/39b566401f954941bba169fd03931cd8/d0fdfa2d5dc143efa30e36bd6f3740feacc147393d12476f933d3814c650cffd'),
  ('chen-hn-6515', 'Chen Hn', 'https://assets.skool.com/f/8d5025ef02304a8ebf96966314b82bbf/f30bda5c1fea456aa901f1fb68e5efb66721bd03f2d54ac89f83ae4e755c856c-sm.jpg'),
  ('rick-chen-6566', 'Rick Chen', 'https://assets.skool.com/f/e7696e3c525443a79f8355a8a9a0ca38/3b13372419e34a9088bf0b4bd083e733119425b13d0448ec9b532e58e37476e6-sm.jpg'),
  ('himson-ng-2157', 'Himson Ng', 'https://assets.skool.com/f/ac25f42eb119424bb90f0bd7b0928a38/7494fdb5ef9f405bacf04ba8ba55df4a121c54ac2b1647e39c9614111c630ffc-sm.jpg'),
  ('changhao-lo-2092', 'Ch Lo', 'https://assets.skool.com/f/899f6584f38b4d818897ef9b6d2e41bf/e14bf7ffe5f74d6d8ef4d062221ea15150a32fa6738849d1baa5ae12c0ea40d0.jpg'),
  ('tom-hsiao-8794', 'Tom Hsiao', 'https://assets.skool.com/f/970e5d7a4e954bb3b181973a07e77417/abe26a54d80045b4a8796713126b095ef61e80f126144951a0eea762764c3247-sm.jpg'),
  ('62548120', '榮崑 賴', 'https://assets.skool.com/f/544bdc771df24d2790f8cd7a35b34abb/c723d01914f349c2a53ae5c23c4b2ed3f4f7b632f52343f2a28ba0c5938d6322-sm.jpg'),
  ('lin-xinhuang-9447', 'Lin Otis', 'https://assets.skool.com/f/f1aff7c981ab45de947f2dedb6bfb9b8/cddb3a2bc6d34ef8b3da373d43fac226f0641cb66cb246a38cf8d402a0f11b08-sm.jpg'),
  ('jason-lu-4202', 'Jason Lu', 'https://assets.skool.com/f/d40762d28dc24b2fbca51b589a966a56/3fbbb9578a3f416fae7098bddaf4a99468310c1bcc624db791ca066411197f9b'),
  ('kim-un-9831', 'Gg L', 'https://assets.skool.com/f/685b4cbcdba54f5bafb22f2d1ea180a3/fd3ac473702e4815beb4e7c4218612fb7d28b1e47d6e4593ab180a42a4e914d5-sm.jpg'),
  ('yu-lin-9540', 'Yu Lin', 'https://assets.skool.com/f/c0937e691583455596d2d9f956c346a6/e45ac544ea30480da38c5627d74511a64a389a9fe11340d0a6a8f7b8716f57b8-sm.jpg'),
  ('ming-liao-4245', 'Ming Liao', 'https://assets.skool.com/f/0ece46f616434f67a909bbe759bdffbc/2457d72f64f14c1d8483a7a3e9baf937d0f791b94fe8462a98adac44419fd977-sm.jpg'),
  ('hsu-vic-4156', 'Hsu Vic', 'https://assets.skool.com/f/c7b017e0efc840838803555f1ff357d0/9b4abe7807154a9ab1fc46274faa273ca4ee4cd4a82a4a19bfbb6a9f41af594c-sm.jpg'),
  ('ha-toto-1706', 'Tim Rou', 'https://assets.skool.com/f/5531d55cae424459a3de9fcb69c91fb7/8dbeed10d7e24933a1f88e7f58efec6667d1d69b409d453585ddb828bfb4ffdc-sm.jpg'),
  ('90977571', '卿 皇', 'https://assets.skool.com/f/ac78ad3076ec4fb1857327c68c106619/a8976477ca1648ba86fecf7253386767b91e3fcb17094fef86c1e6ca36131eba-sm.jpg'),
  ('gen-zhao-6339', 'Gen Zhao', 'https://assets.skool.com/f/07fadebd5cbb42649220d7d37b14b2fd/42259bcbcbf943eaa181ca6f54d95eb14da50ef3dcf94e6a846b55accc55473d-sm.jpg'),
  ('patrick-lim-6024', 'Patrick Lim', 'https://assets.skool.com/f/1a2e9642c4714b74a1d66354adb1c12c/8a75638060be4fb297aada096b35b4c2b629aa6a96e74219ad095c786cc927cf-sm.jpg'),
  ('nelson-hsu-3220', 'Nelson Hsu', 'https://assets.skool.com/f/3a3f3a9b13f74b309268d79a37241360/81c29afc7e414de9bcfd2b355d5a7e0ce32d113175b2401db159e8f1d82d8316-sm.jpg'),
  ('leo-wu-4226', 'Leo Wu', 'https://assets.skool.com/f/995d450d434b497bb74ccf0a559c29d4/2fc00b45c26d4805bc287a187ac10d21706f578f4e4a4a8b96c1e17e87fcc5f5'),
  ('lei-hon-yin-7699', 'Lei Hon Yin', 'https://assets.skool.com/f/e4739bf69e2e41a28635751917c6d0b8/329b6d154b8f424baaafa9b2b01513c5bc0f874888304a92b7be9ed47cae12db-sm.jpg')
) as v(handle, display_name, avatar_url)
where p.handle = v.handle;

-- =====================================================
-- 255 handles below were NOT in us2.json.
-- Most look like Skool POST slugs (auto-IDs / day-X / nofap-Y)
-- that the bot's author-scrape grabbed by mistake. You can
-- delete them if you want a cleaner table — see end of file.
-- =====================================================
--   30mtb-4
--   parker-4
--   2a722166
--   600e653e
--   nofap-4
--   day1-73e7a34c
--   nmo
--   11829275
--   how-2
--   start
--   f9fc5ba5
--   4caf04c4
--   48
--   life-coach
--   e2805718
--   6f30faae
--   817976da
--   day4-2bfab408
--   21992074
--   ee7af478
--   b8a52a1d
--   45-0342ba1c
--   730-3
--   d9059e52
--   5dd75791
--   100-3f6faef7
--   7-b139b992
--   7-5e031a5f
--   0b558cc9
--   534118a0
--   how-ced77839
--   598a034f
--   frank-v20
--   83fc464b
--   30-112cba0b
--   20-2
--   517
--   ezey-lin-4863
--   timothy-30
--   30-d8a35a8a
--   lv
--   30-d9304ba1
--   no-fap30
--   inner-wealth-38-homework
--   0e9fd76a
--   chung
--   day2-c10ad614
--   90-3
--   jacob-yu-9437
--   11-2
--   no-fap-90-day-1
--   655ed75a
--   dunker
--   wong-yoong-kit-9913
--   day7-9b1bc3ee
--   83de7288
--   30-3d9933cb
--   8925bb17
--   sonic-jiang-1544
--   69dcf2cd
--   nofap-day48
--   7-afbae73d
--   30-04052026
--   day3-60b5bccc
--   d1-98c3a229
--   day6-0e27e08a
--   day7-2a175bd4
--   day2-212c3942
--   51030
--   d18
--   day3-1ee88718
--   day16-3
--   b571e1e6
--   johnson-217223
--   7-59377a5b
--   30-c4fcef70
--   45-4
--   chi-ting-kang-3456
--   william-wang-9781
--   boris-lau-4495
--   30-015ea778
--   87412702
--   bb8723fe
--   b3c45d3e
--   30no-fap-2
--   1010-homework
--   peter
--   kirby
--   50
--   510-35387d05
--   23dfe556
--   30-673b6245
--   faedfab6
--   730-2
--   30-7f88f53a
--   7-f664b0ea
--   8511ec79
--   642a98fc
--   round-2
--   721bf3e9
--   1f54a4f9
--   day1-c8812e8a
--   how-539f4cee
--   270a8daa
--   15292417
--   05897a13
--   frank-2
--   76847686
--   week-48
--   9f9a1147
--   day6-990189ec
--   31028825
--   billy5-no-fap-420
--   nofap-day47
--   chung-yuning260508
--   510-4
--   30-517872da
--   76d9246b
--   510-e1336b96
--   d6e8e608
--   6d8d9543
--   nofap-c9af3808
--   302026329
--   day3-56f816f6
--   7-e2a53839
--   510-394e098e
--   510-4012ce1b
--   510-1845403e
--   30-20260511-day-1
--   30-17777803
--   richard-wu-1574
--   30-289015ac
--   42d3f6ca
--   59-4
--   gua-jet-9774
--   20579855
--   510-2626950f
--   michael-shen30
--   59-0740
--   9ad2c857
--   48-homework
--   day7-716c7654
--   510-3
--   5a550ad2
--   79615815
--   59
--   100-4187a020
--   59-2
--   4babf1eb
--   11d2ab92
--   chen-jui-feng-5769
--   2de3550c
--   huan-xu-7684
--   45-12
--   tang-wei-jie-5196
--   day7-427377db
--   day6-6e567e2b
--   30202654
--   day5-7d348bd5
--   hank
--   19e3276e
--   4740e8a8
--   nofap-day46
--   510-2
--   day15-3
--   07bb8e49
--   mtb-d1
--   mike-30-2
--   59-3b1e5023
--   84f72415
--   510
--   day1sean30
--   7-9d790e29
--   30-day-1-3
--   2c9169f3
--   30-93a2e205
--   jack-ee690c3f
--   day6-e2db47b9
--   33ea9893
--   day4-250bb3c2
--   day3-aa28f0d5
--   day5-eef1e0a4
--   day6-413f38b6
--   day14-4
--   77370299
--   5659cfbe
--   5fbf5598
--   7-82c241f9
--   skool-games16
--   58-4
--   eason-kao-6987
--   day4-975ba542
--   day1-4a939bae
--   300
--   30-1ddb57c5
--   f1f19600
--   59-3
--   nofap-day45
--   chen-frank-1285
--   2d4eb736
--   37200366
--   a43c31d3
--   822188db
--   b4d1d86c
--   ruei30
--   110-homework
--   5898e7ba
--   16ef85aa
--   30-c743ca44
--   74058928
--   30no-fap-4
--   day03-04
--   re-good-3533
--   a3f3760e
--   30-90nofap
--   5e28530f
--   nofap32
--   nofap-day44
--   inner-wealth-28-homework
--   day13-3
--   36421376
--   l-weixin-7711
--   30-95c47611
--   6ebf4358
--   31
--   58
--   58-3
--   30-day1
--   day11-cca81682
--   day3-ca55e730
--   day5-c08793a2
--   day-01
--   day4-d1c31a17
--   day12-3
--   day4-4a0758ba
--   67494c9a
--   day-02
--   day5-afdf504f
--   895aa16d
--   restart-rebuild
--   304ab751
--   d6ab6133
--   27413418
--   ycl7comment
--   510374c5
--   418-5fa6cf72
--   no-fap-90
--   4f2ac980
--   881e809c
--   30-day-11
--   nofap-day43
--   wei
--   80b25a67
--   day-1-abb31fd7
--   94ffb24e

-- (Optional) clean up the junk slugs — only deletes rows with
--   * no avatar_url
--   * no display_name OR display_name === handle
--   * a slug pattern that strongly suggests it's a post id, not a user
-- Uncomment to run.
--
-- delete from public.nmo_members
-- where (avatar_url is null or avatar_url = '')
--   and (display_name is null or display_name = handle)
--   and (
--        handle ~ '^[0-9a-f]{6,}$'
--     or handle ~ '^day[0-9]+'
--     or handle ~ '^[0-9]+(-[0-9]+)*$'
--     or handle ~ '^[0-9]+(-[a-z0-9]+)+$'
--     or handle ~ '^nofap'
--     or handle ~ '^no-fap'
--     or handle in ('nmo','start','chung','peter','kirby','hank','wei','lv','life-coach','dunker','round-2','restart-rebuild')
--   );
